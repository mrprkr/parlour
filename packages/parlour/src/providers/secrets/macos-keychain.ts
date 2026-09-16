import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SecretStore } from "../../core/ports.ts";
import { defineProvider, registerProvider } from "../../core/providers.ts";

/** Runs a program and resolves with its output, or rejects the way `execFile` does. */
export type Runner = (program: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync = promisify(execFile);
const defaultRunner: Runner = (program, args) => execFileAsync(program, args);

/** One Keychain service for every connector; the key is the account. */
export const KEYCHAIN_SERVICE = "parlour-connector";

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
      try {
        // -U updates in place, so re-authorising does not pile up duplicates.
        await run("security", [
          "add-generic-password",
          "-U",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          key,
          "-w",
          value,
          "-l",
          `Parlour: ${key}`,
        ]);
      } catch (error) {
        // execFile puts the whole command line in its message, and the value
        // is on that command line. A locked Keychain or a denied prompt must
        // not end up printing the tokens to the terminal or the service log.
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
