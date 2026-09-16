import type { ServiceManager } from "../../core/ports.ts";
import { createLaunchd } from "./launchd.ts";

const UNSUPPORTED =
  "Services are only supported on macOS so far. A systemd provider would be a welcome contribution.";

/**
 * The service manager is not chosen in config: there is one right answer per
 * platform. Elsewhere than a Mac every method throws the same sentence, so
 * `parlour service install` fails with a reason rather than a missing binary.
 */
export function pickServiceManager(platform: NodeJS.Platform = process.platform): ServiceManager {
  if (platform === "darwin") return createLaunchd();
  const refuse = async (): Promise<never> => {
    throw new Error(UNSUPPORTED);
  };
  return { install: refuse, uninstall: refuse, restart: refuse, status: refuse, tail: refuse };
}
