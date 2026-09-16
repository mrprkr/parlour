import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { logger } from "../../core/logger.ts";
import type { Paths } from "../../core/paths.ts";
import type { SecretStore } from "../../core/ports.ts";
import { pickSecretStore } from "../../providers/secrets/index.ts";

const log = logger("connectors");

export interface Connector {
  /** Short name, used as the tool prefix and the secret store key. */
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
 * beside the config: readable, diffable, and safe to look at. The tokens go
 * through a `SecretStore`, the Keychain on a Mac, because a file full of live
 * refresh tokens for the household's calendar and email is not something to
 * leave lying in a checkout. Which store is decided once, by the platform.
 */
export class ConnectorStore {
  readonly #file: string;
  readonly #secrets: SecretStore;

  constructor(file: string, secrets: SecretStore) {
    this.#file = resolve(file);
    this.#secrets = secrets;
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
    await this.#write([...others, connector]);
  }

  async remove(name: string): Promise<boolean> {
    const all = await this.list();
    const kept = all.filter((c) => c.name !== name);
    if (kept.length === all.length) return false;
    await this.#write(kept);
    await this.clearSecrets(name);
    return true;
  }

  /** The file lives in the Parlour home, which may not exist before `parlour init`. */
  async #write(connectors: Connector[]): Promise<void> {
    await mkdir(dirname(this.#file), { recursive: true });
    await writeFile(this.#file, `${JSON.stringify(connectors, null, 2)}\n`);
  }

  async secrets(name: string): Promise<ConnectorSecrets> {
    const raw = await this.#secrets.get(name);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as ConnectorSecrets;
    } catch {
      return {};
    }
  }

  async saveSecrets(name: string, secrets: ConnectorSecrets): Promise<void> {
    await this.#secrets.set(name, JSON.stringify(secrets));
  }

  async clearSecrets(name: string): Promise<void> {
    await this.#secrets.delete(name);
  }
}

/** The store for this machine: `connectors.json` beside the config, tokens wherever the platform keeps them. */
export function connectorStore(paths: Paths, secrets: SecretStore = pickSecretStore(paths)): ConnectorStore {
  return new ConnectorStore(paths.connectorsFile, secrets);
}
