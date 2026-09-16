import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Paths } from "./paths.ts";

/**
 * Secrets stay out of `config.json` so that file can be shown, diffed and
 * pasted into a bug report. They live in `secrets.env` (mode 600) as plain
 * `KEY=value` lines, and the process environment wins over the file so a
 * one-off run or a LaunchAgent can override without editing anything.
 */
export interface Secrets {
  haToken?: string;
  anthropicKey?: string;
  braveKey?: string;
  /** Required before the server will listen anywhere but loopback. */
  token?: string;
  logLevel?: string;
}

/**
 * The subset of dotenv we need: `KEY=value`, `#` comments, optional single or
 * double quotes, a tolerated `export` prefix. No interpolation, on purpose.
 */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    // A comment or blank line fails to match, so nothing else filters them.
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1] as string;
    const raw = (match[2] as string).trim();
    out[key] = unquote(raw);
  }
  return out;
}

function unquote(raw: string): string {
  // A quoted value may carry a comment after its closing quote, as a bare one
  // may, so a hand-edited file reads the same way whichever form it uses.
  const double = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(raw);
  if (double) return (double[1] as string).replace(/\\(["\\])/g, "$1");
  const single = /^'([^']*)'\s*(?:#.*)?$/.exec(raw);
  if (single) return single[1] as string;
  // An unquoted value ends at the first ` #`, as it would in a shell.
  return raw.replace(/\s+#.*$/, "");
}

function quote(value: string): string {
  // Anything that would be misread on a bare line gets double quotes.
  return /[\s#"'\\]/.test(value) || value === "" ? `"${value.replace(/(["\\])/g, "\\$1")}"` : value;
}

export function loadSecrets(paths: Paths, env: NodeJS.ProcessEnv = process.env): Secrets {
  const file = existsSync(paths.secretsFile) ? parseEnvFile(readFileSync(paths.secretsFile, "utf8")) : {};
  const get = (key: string) => env[key] ?? file[key];
  return {
    haToken: get("HA_TOKEN"),
    anthropicKey: get("ANTHROPIC_API_KEY"),
    braveKey: get("BRAVE_API_KEY"),
    // AGENT_TOKEN is what the first release called it. Read for one release so
    // an upgrade does not lock every phone and satellite out of the house.
    token: get("PARLOUR_TOKEN") ?? get("AGENT_TOKEN"),
    logLevel: get("LOG_LEVEL"),
  };
}

/**
 * Rewrites `secrets.env` with one key changed, keeping every other line as it
 * was, comments included. `null` removes the key.
 */
export function writeSecret(paths: Paths, key: string, value: string | null): void {
  // The key goes straight into a RegExp and onto a line the parser must read
  // back, so it has to be a plain environment name.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`"${key}" is not a valid secret name.`);
  const existing = existsSync(paths.secretsFile) ? readFileSync(paths.secretsFile, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const isKey = (line: string) => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line);
  const next: string[] = [];
  let replaced = false;
  for (const line of lines) {
    if (!isKey(line)) {
      next.push(line);
    } else if (value !== null && !replaced) {
      next.push(`${key}=${quote(value)}`);
      replaced = true;
    }
  }
  if (value !== null && !replaced) next.push(`${key}=${quote(value)}`);
  mkdirSync(dirname(paths.secretsFile), { recursive: true });
  writeFileSync(paths.secretsFile, next.length ? `${next.join("\n")}\n` : "", { mode: 0o600 });
  // The mode option only applies when the file is created, so set it again.
  chmodSync(paths.secretsFile, 0o600);
}
