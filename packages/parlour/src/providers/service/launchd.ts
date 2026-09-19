import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { ServiceManager, ServiceSpec, ServiceState } from "../../core/ports.ts";
import { defineProvider, registerProvider } from "../../core/providers.ts";

/**
 * The agent as something the Mac starts on its own and keeps running.
 *
 * launchd is the only supervisor on a Mac worth using: it starts things at
 * login, restarts them when they die, and survives a reboot without anything
 * else being installed. This file is the one place that knows how to write
 * it. What to run comes from `core/services.ts`, so this knows nothing about
 * parlour or whisper, only about plists.
 */

const run = promisify(execFile);
const MAX_LOG_BYTES = 8 * 1024 * 1024;

export const LaunchdSchema = z.object({
  launchAgentsDir: z.string().default(() => join(homedir(), "Library", "LaunchAgents")),
  /**
   * The launchctl to run. launchd is one per user, so a job bootstrapped
   * against a scratch HOME is still a real job that outlives whatever wrote
   * it. The test suite points this at a stub and exercises everything up to
   * that call.
   */
  launchctl: z.string().default("launchctl"),
});

export type LaunchdOptions = z.infer<typeof LaunchdSchema>;

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Both streams go to the one log. The logger writes warnings to stderr and
 * the rest to stdout, and a single file keeps them in the order they happened
 * rather than in two files a person has to interleave by eye.
 */
export function renderPlist(spec: ServiceSpec): string {
  const strings = spec.program.map((arg) => `    <string>${xmlEscape(arg)}</string>`).join("\n");
  const env = Object.entries(spec.env)
    .map(([key, value]) => `    <key>${xmlEscape(key)}</key><string>${xmlEscape(value)}</string>`)
    .join("\n");

  // KeepAlive on a crash but not on a clean exit: a person who stops the agent
  // deliberately should not have to fight launchd to keep it stopped, and a
  // crash loop should not spin the CPU.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xmlEscape(spec.label)}</string>
  <key>ProgramArguments</key><array>
${strings}
  </array>
  <key>WorkingDirectory</key><string>${xmlEscape(homedir())}</string>
  <key>EnvironmentVariables</key><dict>
${env}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict>
    <key>SuccessfulExit</key><false/>
    <key>Crashed</key><true/>
  </dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${xmlEscape(spec.logPath)}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(spec.logPath)}</string>
</dict>
</plist>
`;
}

/** launchd never rotates anything, so a year of logs is one enormous file. */
async function rotate(path: string): Promise<void> {
  try {
    if (statSync(path).size < MAX_LOG_BYTES) return;
    await rename(path, `${path}.1`);
  } catch {
    /* no log yet, which is the usual case */
  }
}

export function createLaunchd(options: LaunchdOptions = LaunchdSchema.parse({})): ServiceManager {
  const plistPath = (label: string) => join(options.launchAgentsDir, `${label}.plist`);

  /**
   * `bootstrap` is the modern way in and `load` is what older systems answer
   * to. Both are tried because the failure mode of guessing wrong is a service
   * that silently never starts.
   *
   * "stop" is "unload" without the `-w`: the old flag writes the job into
   * launchd's disabled list, which survives a reboot, and a person who asked
   * for it to stop until the next login would find it never coming back.
   */
  async function launch(action: "load" | "unload" | "stop", label: string): Promise<boolean> {
    const file = plistPath(label);
    const domain = `gui/${process.getuid?.() ?? 0}`;
    const modern = action === "load" ? ["bootstrap", domain, file] : ["bootout", `${domain}/${label}`];
    const legacy =
      action === "load"
        ? ["load", "-w", file]
        : action === "stop"
          ? ["unload", file]
          : ["unload", "-w", file];
    for (const args of [modern, legacy]) {
      try {
        await run(options.launchctl, args);
        return true;
      } catch {}
    }
    return false;
  }

  async function state(spec: Pick<ServiceSpec, "label" | "what" | "logPath">): Promise<ServiceState> {
    const base: ServiceState = {
      label: spec.label,
      what: spec.what,
      installed: existsSync(plistPath(spec.label)),
      running: false,
      pid: null,
      lastExit: null,
      logPath: spec.logPath,
    };

    try {
      const { stdout } = await run(options.launchctl, ["list", spec.label]);
      const pid = Number(stdout.match(/"PID"\s*=\s*(\d+)/)?.[1] ?? NaN);
      const exit = Number(stdout.match(/"LastExitStatus"\s*=\s*(-?\d+)/)?.[1] ?? NaN);
      return {
        ...base,
        running: Number.isFinite(pid),
        pid: Number.isFinite(pid) ? pid : null,
        lastExit: Number.isFinite(exit) ? exit : null,
      };
    } catch {
      return base;
    }
  }

  return {
    async install(specs) {
      await mkdir(options.launchAgentsDir, { recursive: true });
      for (const spec of specs) {
        await mkdir(dirname(spec.logPath), { recursive: true });
        await rotate(spec.logPath);
        await writeFile(plistPath(spec.label), renderPlist(spec));
        // Unload first: launchd will not notice an edited plist on its own.
        await launch("unload", spec.label);
        await launch("load", spec.label);
      }
      return Promise.all(specs.map(state));
    },

    async uninstall(labels) {
      const removed: string[] = [];
      for (const label of labels) {
        if (!existsSync(plistPath(label))) continue;
        await launch("unload", label);
        await rm(plistPath(label), { force: true });
        removed.push(label);
      }
      return removed;
    },

    async stop(specs) {
      // Booted out, not deleted: the plist stays, so launchd starts it again
      // at the next login and `parlour service status` still lists it. That is
      // the difference a person means between "stop it" and "get rid of it".
      for (const spec of specs) {
        if (!existsSync(plistPath(spec.label))) continue;
        await launch("stop", spec.label);
      }
      return Promise.all(specs.map(state));
    },

    async restart(specs) {
      for (const spec of specs) {
        if (!existsSync(plistPath(spec.label))) continue;
        await launch("unload", spec.label);
        await launch("load", spec.label);
      }
      return Promise.all(specs.map(state));
    },

    status(specs) {
      return Promise.all(specs.map(state));
    },

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

export const launchd = defineProvider<ServiceManager>({
  kind: "service",
  name: "launchd",
  description: "LaunchAgents, so the agent starts at login and comes back when it falls over",
  schema: LaunchdSchema,
  create: (options) => createLaunchd(options as LaunchdOptions),
});

registerProvider(launchd);
