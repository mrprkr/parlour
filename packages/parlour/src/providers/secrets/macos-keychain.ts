import { execFile } from "node:child_process";
import type { SecretStore } from "../../core/ports.ts";
import { defineProvider, registerProvider } from "../../core/providers.ts";

/**
 * Runs a program, feeding `input` to its stdin, and resolves with its output
 * or rejects the way `execFile` does, with `code` and `stderr` on the error.
 */
export type Runner = (
  program: string,
  args: string[],
  input?: string,
) => Promise<{ stdout: string; stderr: string }>;

const defaultRunner: Runner = (program, args, input = "") =>
  new Promise((resolve, reject) => {
    const child = execFile(program, args, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
    child.stdin?.end(input);
  });

/** One Keychain service for every connector; the key is the account. */
export const KEYCHAIN_SERVICE = "parlour-connector";

/**
 * Quotes one word for a `security -i` command line. Interactive mode splits
 * on whitespace and honours double quotes with backslash escapes for `"` and
 * `\`, but it reads a line at a time, so a value with a line break cannot be
 * expressed. A connector's JSON blob never has one.
 */
export function quoteForSecurity(word: string): string {
  if (/[\r\n]/.test(word)) {
    throw new Error("The Keychain store cannot hold a value with a line break.");
  }
  return `"${word.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The login Keychain, through the `security` tool that ships with macOS. A
 * file full of live refresh tokens for the household's calendar and email is
 * not something to leave lying in a checkout, and the Keychain is already
 * encrypted, backed up and unlocked with the login.
 *
 * `run` is a parameter so the store can be tested without touching the
 * developer's real Keychain.
 */
export function createKeychainStore(run: Runner = defaultRunner): SecretStore {
  return {
    async get(key) {
      try {
        const { stdout } = await run("security", [
          "find-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          key,
          "-w",
        ]);
        return stdout.trim() || null;
      } catch {
        // `security` exits 44 when there is no such item, which is the usual
        // case for a connector that has not signed in yet.
        return null;
      }
    },
    async set(key, value) {
      // The value is a live token blob and process arguments are visible to
      // every local user through `ps` for as long as `security` runs, so the
      // command goes down stdin in interactive mode rather than on argv.
      // -U updates in place, so re-authorising does not pile up duplicates.
      const line = [
        "add-generic-password",
        "-U",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        quoteForSecurity(key),
        "-w",
        quoteForSecurity(value),
        "-l",
        quoteForSecurity(`Parlour: ${key}`),
      ].join(" ");
      try {
        await run("security", ["-i"], `${line}\n`);
      } catch (error) {
        // execFile puts the command line in its message. The value is no
        // longer on it, but a locked Keychain or a denied prompt should still
        // report the reason rather than the mechanics.
        const { stderr, code } = error as { stderr?: string; code?: number | string };
        const reason = stderr?.trim() || `security exited ${code ?? "without a code"}`;
        throw new Error(`The Keychain would not store ${key}: ${reason}`);
      }
    },
    async delete(key) {
      await run("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", key]).catch(() => {});
    },
  };
}

export const keychainStore = defineProvider<SecretStore>({
  kind: "secrets",
  name: "macos-keychain",
  description: "Connector tokens in the macOS login Keychain",
  create: () => createKeychainStore(),
});

registerProvider(keychainStore);
