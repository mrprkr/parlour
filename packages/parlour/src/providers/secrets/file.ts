import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Paths } from "../../core/paths.ts";
import type { SecretStore } from "../../core/ports.ts";
import { defineProvider, registerProvider } from "../../core/providers.ts";

/**
 * One file per key under the config directory, for a machine without a
 * Keychain. The directory is 700 and each file 600, which is as good as a
 * plain file gets; a Linux contribution of a libsecret provider would be
 * welcome.
 */
export function createFileStore(paths: Paths): SecretStore {
  const dir = join(paths.home, "connector-secrets");
  const fileFor = (key: string) => {
    // The key becomes a file name, so it must not be able to leave the directory.
    if (!/^[A-Za-z0-9_.-]+$/.test(key) || key.startsWith(".")) {
      throw new Error(`"${key}" is not a valid secret name.`);
    }
    return join(dir, key);
  };
  return {
    async get(key) {
      const file = fileFor(key);
      try {
        return await readFile(file, "utf8");
      } catch {
        return null;
      }
    },
    async set(key, value) {
      const file = fileFor(key);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(file, value, { mode: 0o600 });
    },
    async delete(key) {
      await rm(fileFor(key), { force: true });
    },
  };
}

export const fileStore = defineProvider<SecretStore>({
  kind: "secrets",
  name: "file",
  description: "Connector tokens in files under the config directory, mode 600",
  schema: z.object({}).passthrough(),
  create: (_options, context) => createFileStore(context.paths),
});

registerProvider(fileStore);
