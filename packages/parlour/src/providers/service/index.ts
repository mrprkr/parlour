import type { ServiceManager } from "../../core/ports.ts";
import { sandboxed } from "../../core/sandbox.ts";
import { createLaunchd, LaunchdSchema } from "./launchd.ts";
import { createSandboxed } from "./sandboxed.ts";

const UNSUPPORTED =
  "Services are only supported on macOS so far. A systemd provider would be a welcome contribution.";

/**
 * The service manager is not chosen in config: there is one right answer per
 * platform. Elsewhere than a Mac every method throws the same sentence, so
 * `parlour service install` fails with a reason rather than a missing binary.
 *
 * `PARLOUR_LAUNCHCTL` names another launchctl. It is for the test suite,
 * which runs the CLI as a process against a scratch HOME and must never
 * bootstrap a job into the launchd of whoever ran the tests. An empty value
 * counts as unset, as with the other variables.
 *
 * Inside the App Store app's sandbox there is no launchd to write to, so the
 * answer there is the sandboxed manager, which installs nothing.
 */
export function pickServiceManager(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ServiceManager {
  if (platform === "darwin" && sandboxed(env)) return createSandboxed();
  if (platform === "darwin") {
    return createLaunchd(LaunchdSchema.parse({ launchctl: env.PARLOUR_LAUNCHCTL || undefined }));
  }
  const refuse = async (): Promise<never> => {
    throw new Error(UNSUPPORTED);
  };
  return { install: refuse, uninstall: refuse, stop: refuse, restart: refuse, status: refuse, tail: refuse };
}
