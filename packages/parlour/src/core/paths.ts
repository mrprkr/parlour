import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where Parlour keeps its things. Config and secrets are small and personal,
 * so they live under `~/.config`. Models are large and re-downloadable, so
 * they live in the cache, and logs go where the platform expects to find them.
 *
 * `PARLOUR_HOME` moves the config directory as a whole (handy for tests and
 * for running two instances). `PARLOUR_CONFIG` moves only the config file, so
 * that a one-off run can try a different set-up without losing its secrets.
 * Neither touches the cache: models are the same whichever config is in use.
 */
export interface Paths {
  home: string;
  configFile: string;
  secretsFile: string;
  connectorsFile: string;
  cacheDir: string;
  modelsDir: string;
  logsDir: string;
}

export function resolvePaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Paths {
  // Read HOME from the given env rather than os.homedir() so a test can
  // control it. homedir() is the fallback for a shell that lost the variable.
  // An empty variable counts as unset throughout: `export PARLOUR_HOME=` in a
  // stripped LaunchAgent environment must not quietly move config to the cwd.
  const user = env.HOME || homedir();
  const home = env.PARLOUR_HOME || join(user, ".config", "parlour");
  const darwin = platform === "darwin";
  const cacheDir = darwin
    ? join(user, "Library", "Caches", "parlour")
    : join(env.XDG_CACHE_HOME || join(user, ".cache"), "parlour");
  const logsDir = darwin
    ? join(user, "Library", "Logs", "parlour")
    : join(env.XDG_STATE_HOME || join(user, ".local", "state"), "parlour", "logs");
  return {
    home,
    configFile: env.PARLOUR_CONFIG || join(home, "config.json"),
    secretsFile: join(home, "secrets.env"),
    connectorsFile: join(home, "connectors.json"),
    cacheDir,
    modelsDir: join(cacheDir, "models"),
    logsDir,
  };
}
