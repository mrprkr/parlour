import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { logger } from "../logger.ts";

const run = promisify(execFile);
const log = logger("connectors");

const SERVICE = "home-agent-connector";

export interface Connector {
  /** Short name, used as the tool prefix and the Keychain account. */
  name: string;
  url: string;
  /** OAuth scopes to ask for, when the server does not advertise its own. */
  scope?: string;
  addedAt: string;
}

/** Everything OAuth needs to remember between runs, per connector. */
export interface ConnectorSecrets {
  tokens?: Record<string, unknown>;
  client?: Record<string, unknown>;
  verifier?: string;
}

/**
 * Connectors are two halves kept apart on purpose.
 *
 * The metadata (what is connected, and where) lives in `connectors.json`
 * beside the config: readable, diffable, and safe to look at. The tokens live
 * in the login Keychain, because a file full of live refresh tokens for the
 * household's calendar and email is not something to leave lying in a git
 * checkout. A file fallback exists for machines without `security`, and it is
 * mode 600.
 */
export class ConnectorStore {
  readonly #file: string;
  readonly #fallbackDir: string;

  constructor(file: string) {
    this.#file = resolve(file);
    this.#fallbackDir = join(dirname(this.#file), ".connector-secrets");
  }

  async list(): Promise<Connector[]> {
    if (!existsSync(this.#file)) return [];
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#file, "utf8"));
      return Array.isArray(parsed) ? (parsed as Connector[]) : [];
    } catch (error) {
      log.error(`${this.#file} is not readable:`, error);
      return [];
    }
  }

  async add(connector: Connector): Promise<void> {
    const others = (await this.list()).filter((c) => c.name !== connector.name);
    await writeFile(this.#file, JSON.stringify([...others, connector], null, 2) + "\n");
  }

  async remove(name: string): Promise<boolean> {
    const all = await this.list();
    const kept = all.filter((c) => c.name !== name);
    if (kept.length === all.length) return false;
    await writeFile(this.#file, JSON.stringify(kept, null, 2) + "\n");
    await this.clearSecrets(name);
    return true;
  }

  async secrets(name: string): Promise<ConnectorSecrets> {
    const raw = (await this.#keychainRead(name)) ?? (await this.#fileRead(name));
    if (!raw) return {};
    try {
      return JSON.parse(raw) as ConnectorSecrets;
    } catch {
      return {};
    }
  }

  async saveSecrets(name: string, secrets: ConnectorSecrets): Promise<void> {
    const raw = JSON.stringify(secrets);
    if (await this.#keychainWrite(name, raw)) return;
    await mkdir(this.#fallbackDir, { recursive: true, mode: 0o700 });
    await writeFile(join(this.#fallbackDir, `${name}.json`), raw, { mode: 0o600 });
  }

  async clearSecrets(name: string): Promise<void> {
    await run("security", ["delete-generic-password", "-s", SERVICE, "-a", name]).catch(() => {});
    await rm(join(this.#fallbackDir, `${name}.json`), { force: true });
  }

  async #keychainRead(name: string): Promise<string | null> {
    try {
      const { stdout } = await run("security", ["find-generic-password", "-s", SERVICE, "-a", name, "-w"]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  async #keychainWrite(name: string, value: string): Promise<boolean> {
    try {
      // -U updates in place, so re-authorising does not pile up duplicates.
      await run("security", [
        "add-generic-password",
        "-U",
        "-s",
        SERVICE,
        "-a",
        name,
        "-w",
        value,
        "-l",
        `Home agent: ${name}`,
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async #fileRead(name: string): Promise<string | null> {
    try {
      return await readFile(join(this.#fallbackDir, `${name}.json`), "utf8");
    } catch {
      return null;
    }
  }
}
