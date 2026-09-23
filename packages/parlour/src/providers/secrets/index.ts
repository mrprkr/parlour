import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import type { Paths } from "../../core/paths.ts";
import type { SecretStore } from "../../core/ports.ts";
import { sandboxed } from "../../core/sandbox.ts";
import { createFileStore } from "./file.ts";
import { createKeychainStore } from "./macos-keychain.ts";

export { createFileStore, fileStore } from "./file.ts";
export { createKeychainStore, KEYCHAIN_SERVICE, keychainStore } from "./macos-keychain.ts";

/** A store that also says which one it is, for `parlour doctor` and tests. */
export interface NamedSecretStore extends SecretStore {
  readonly name: "macos-keychain" | "file";
}

function onPath(program: string, env: NodeJS.ProcessEnv): boolean {
  return (env.PATH ?? "").split(delimiter).some((dir) => {
    if (!dir) return false;
    try {
      accessSync(join(dir, program), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * The secret store is not chosen in config: there is one right answer per
 * machine. The Keychain when this is a Mac with `security` on the PATH (a
 * stripped LaunchAgent PATH can lose it), a file otherwise. Inside the App
 * Store app's sandbox `security` is there but the login keychain is not
 * Parlour's to write to, so it is the file, which lives in the app's container.
 */
export function pickSecretStore(
  paths: Paths,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NamedSecretStore {
  if (platform === "darwin" && !sandboxed(env) && onPath("security", env)) {
    return { name: "macos-keychain", ...createKeychainStore() };
  }
  return { name: "file", ...createFileStore(paths) };
}
