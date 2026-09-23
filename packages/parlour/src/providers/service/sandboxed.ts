import { readFile } from "node:fs/promises";
import type { ServiceManager, ServiceSpec, ServiceState } from "../../core/ports.ts";
import { SANDBOXED_SERVICES } from "../../core/sandbox.ts";

/**
 * The service manager for a Parlour inside the App Store app's sandbox, where
 * a LaunchAgent cannot be written and would not be allowed to run. The app
 * starts `parlour start`, and `parlour start` starts what it keeps warm (see
 * `core/companions.ts`), so there is nothing here to install.
 *
 * Asking what is installed is answered honestly, with nothing, so the doctor
 * and init carry on. Asking for a change is refused with the reason, so a
 * `parlour service install` typed by hand says why rather than failing on a
 * permission error from somewhere in launchctl.
 */
export function createSandboxed(): ServiceManager {
  const refuse = async (): Promise<never> => {
    throw new Error(SANDBOXED_SERVICES);
  };
  const nothing = (spec: Pick<ServiceSpec, "label" | "what" | "logPath">): ServiceState => ({
    label: spec.label,
    what: spec.what,
    installed: false,
    running: false,
    pid: null,
    lastExit: null,
    logPath: spec.logPath,
  });
  return {
    install: refuse,
    uninstall: async () => [],
    stop: async (specs) => specs.map(nothing),
    restart: refuse,
    status: async (specs) => specs.map(nothing),
    async tail(logPath, lines) {
      try {
        const text = await readFile(logPath, "utf8");
        const last = text.split("\n").filter(Boolean).slice(-lines);
        if (last.length) return last.join("\n");
      } catch {}
      return `Nothing logged yet at ${logPath}.`;
    },
  };
}
