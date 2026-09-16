import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { loadConfig } from "./config.ts";

/**
 * The agent as something the Mac starts on its own and keeps running.
 *
 *   pnpm service install     write the LaunchAgents and start them
 *   pnpm service status      what is running, and what it last did
 *   pnpm service restart     after a config change
 *   pnpm service logs        the last of what it said
 *   pnpm service uninstall   stop and forget
 *
 * launchd is the only supervisor on a Mac worth using: it starts things at
 * login, restarts them when they die, and survives a reboot without anything
 * else being installed. This file is the one place that knows how to write it,
 * so the installer, the app and a person in a terminal all get the same
 * services rather than three near-misses.
 */

const run = promisify(execFile);
const HOME = homedir();
const LAUNCH_DIR = join(HOME, "Library/LaunchAgents");
const LOG_DIR = join(HOME, "Library/Logs");
const MAX_LOG_BYTES = 8 * 1024 * 1024;

export const AGENT_LABEL = "io.stuntdouble.home-agent";
export const WHISPER_LABEL = "io.stuntdouble.home-agent-whisper";

export interface ServiceSpec {
  label: string;
  what: string;
  program: string[];
  env: Record<string, string>;
}

export interface ServiceState {
  label: string;
  what: string;
  installed: boolean;
  running: boolean;
  pid: number | null;
  /** launchd's record of how it last ended. Non-zero after a crash. */
  lastExit: number | null;
  logPath: string;
}

// ------------------------------------------------------------------- specs

/** A LaunchAgent starts with almost no PATH, so everything is spelled out. */
function toolPath(...binaries: (string | undefined)[]): string {
  const dirs = new Set<string>();
  for (const binary of binaries) {
    if (binary) dirs.add(join(binary, ".."));
  }
  return [...dirs, "/usr/bin", "/bin", "/usr/sbin"].join(":");
}

async function which(binary: string): Promise<string | undefined> {
  try {
    const { stdout } = await run("which", [binary], {
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}` },
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function specs(agentDir: string): Promise<ServiceSpec[]> {
  const { config } = loadConfig(join(agentDir, process.env.AGENT_CONFIG ?? "agent.config.json"));
  const out: ServiceSpec[] = [];

  const node = (await which("node")) ?? process.execPath;
  out.push({
    label: AGENT_LABEL,
    what: config.role === "satellite" ? "the satellite" : "the agent",
    program: [
      node,
      "--experimental-strip-types",
      `--env-file-if-exists=${join(agentDir, ".env")}`,
      join(agentDir, "src/index.ts"),
    ],
    env: { PATH: toolPath(node, await which("ffmpeg"), await which("afplay")) },
  });

  // A satellite has no models of its own to keep warm.
  if (config.role === "server") {
    const whisper = await which("whisper-server");
    const model = firstWhisperModel(agentDir);
    if (whisper && model) {
      out.push({
        label: WHISPER_LABEL,
        what: "whisper, kept warm",
        program: [
          whisper,
          "--host",
          "127.0.0.1",
          "--port",
          String(new URL(config.stt.url).port || 8910),
          "--model",
          model,
          "--language",
          config.stt.language,
          "--threads",
          "6",
          "--no-timestamps",
          "--convert",
        ],
        // whisper-server shells out to ffmpeg for --convert.
        env: { PATH: toolPath(whisper, await which("ffmpeg")) },
      });
    }
  }

  return out;
}

function firstWhisperModel(agentDir: string): string | undefined {
  const dir = join(agentDir, "models/whisper");
  if (!existsSync(dir)) return undefined;
  const file = readdirSync(dir)
    .filter((name) => name.endsWith(".bin"))
    .sort()[0];
  return file ? join(dir, file) : undefined;
}

// ------------------------------------------------------------------ launchd

function plist(spec: ServiceSpec, agentDir: string): string {
  const strings = spec.program.map((arg) => `    <string>${escape(arg)}</string>`).join("\n");
  const env = Object.entries(spec.env)
    .map(([key, value]) => `    <key>${escape(key)}</key><string>${escape(value)}</string>`)
    .join("\n");

  // KeepAlive on a crash but not on a clean exit: a person who stops the agent
  // deliberately should not have to fight launchd to keep it stopped, and a
  // crash loop should not spin the CPU.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${escape(spec.label)}</string>
  <key>ProgramArguments</key><array>
${strings}
  </array>
  <key>WorkingDirectory</key><string>${escape(agentDir)}</string>
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
  <key>StandardOutPath</key><string>${escape(logPath(spec.label))}</string>
  <key>StandardErrorPath</key><string>${escape(logPath(spec.label, "err"))}</string>
</dict>
</plist>
`;
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function logPath(label: string, extension = "log"): string {
  return join(LOG_DIR, `${label}.${extension}`);
}

function plistPath(label: string): string {
  return join(LAUNCH_DIR, `${label}.plist`);
}

/**
 * `bootstrap` is the modern way in and `load` is what older systems answer to.
 * Both are tried because the failure mode of guessing wrong is a service that
 * silently never starts.
 */
async function launch(action: "load" | "unload", label: string): Promise<boolean> {
  const file = plistPath(label);
  const domain = `gui/${process.getuid?.() ?? 0}`;
  const modern = action === "load" ? ["bootstrap", domain, file] : ["bootout", `${domain}/${label}`];
  const legacy = action === "load" ? ["load", "-w", file] : ["unload", "-w", file];
  for (const args of [modern, legacy]) {
    try {
      await run("launchctl", args);
      return true;
    } catch {}
  }
  return false;
}

export async function state(spec: Pick<ServiceSpec, "label" | "what">): Promise<ServiceState> {
  const base: ServiceState = {
    label: spec.label,
    what: spec.what,
    installed: existsSync(plistPath(spec.label)),
    running: false,
    pid: null,
    lastExit: null,
    logPath: logPath(spec.label),
  };

  try {
    const { stdout } = await run("launchctl", ["list", spec.label]);
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

export async function install(agentDir: string, only?: string[]): Promise<ServiceState[]> {
  await mkdir(LAUNCH_DIR, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });

  const wanted = (await specs(agentDir)).filter((spec) => !only || only.includes(spec.label));
  for (const spec of wanted) {
    await rotate(logPath(spec.label));
    await rotate(logPath(spec.label, "err"));
    await writeFile(plistPath(spec.label), plist(spec, agentDir));
    // Unload first: launchd will not notice an edited plist on its own.
    await launch("unload", spec.label);
    await launch("load", spec.label);
  }
  return Promise.all(wanted.map(state));
}

export async function uninstall(agentDir: string): Promise<string[]> {
  const removed: string[] = [];
  for (const label of [AGENT_LABEL, WHISPER_LABEL]) {
    if (!existsSync(plistPath(label))) continue;
    await launch("unload", label);
    await rm(plistPath(label), { force: true });
    removed.push(label);
  }
  void agentDir;
  return removed;
}

export async function restart(agentDir: string): Promise<ServiceState[]> {
  const all = await specs(agentDir);
  for (const spec of all) {
    if (!existsSync(plistPath(spec.label))) continue;
    await launch("unload", spec.label);
    await launch("load", spec.label);
  }
  return Promise.all(all.map(state));
}

export async function statusAll(agentDir: string): Promise<ServiceState[]> {
  const known = await specs(agentDir);
  const labels = new Set(known.map((spec) => spec.label));
  const extra = [AGENT_LABEL, WHISPER_LABEL]
    .filter((label) => !labels.has(label) && existsSync(plistPath(label)))
    .map((label) => ({ label, what: "left over" }));
  return Promise.all([...known, ...extra].map(state));
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

export async function tail(label: string, lines: number): Promise<string> {
  const out: string[] = [];
  for (const extension of ["log", "err"]) {
    try {
      const text = await readFile(logPath(label, extension), "utf8");
      const last = text.split("\n").filter(Boolean).slice(-lines);
      if (last.length) out.push(`--- ${label}.${extension}\n${last.join("\n")}`);
    } catch {}
  }
  return out.join("\n\n") || `Nothing logged yet for ${label}.`;
}

// ---------------------------------------------------------------------- cli

if (process.argv[1]?.endsWith("service.ts")) {
  const agentDir = resolve(process.env.AGENT_DIR ?? process.cwd());
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const command = args.find((arg) => !arg.startsWith("--")) ?? "status";

  const report = (states: ServiceState[]) => {
    if (json) {
      console.log(JSON.stringify(states));
      return;
    }
    if (!states.length) {
      console.log("Nothing installed. Run: pnpm service install");
      return;
    }
    for (const service of states) {
      const mark = service.running ? "running" : service.installed ? "stopped" : "absent ";
      const detail = service.running
        ? `pid ${service.pid}`
        : service.lastExit
          ? `last exit ${service.lastExit}`
          : "";
      console.log(`${mark}  ${service.what.padEnd(18)} ${detail}`);
    }
  };

  if (process.platform !== "darwin" && command !== "status") {
    console.error(
      "launchd is a Mac thing. On anything else, run the agent under whatever supervises services there.",
    );
    process.exitCode = 2;
  } else {
    switch (command) {
      case "install": {
        // --only=whisper is how the app installs the speech service without
        // also installing an agent it intends to supervise itself: two copies
        // of the agent means two processes fighting over one microphone.
        const which = args.find((arg) => arg.startsWith("--only="))?.slice(7);
        const only = which ? [which === "whisper" ? WHISPER_LABEL : AGENT_LABEL] : undefined;
        const installed = await install(agentDir, only);
        report(installed);
        if (!json && !which) {
          console.log("\nIt starts at login from now on, and restarts itself if it falls over.");
          console.log("The first run asks for the microphone. Approve it, or it hears nothing.");
        }
        break;
      }
      case "uninstall": {
        const removed = await uninstall(agentDir);
        console.log(
          json
            ? JSON.stringify(removed)
            : removed.length
              ? `Removed ${removed.join(", ")}.`
              : "Nothing to remove.",
        );
        break;
      }
      case "restart":
        report(await restart(agentDir));
        break;
      case "status":
        report(await statusAll(agentDir));
        break;
      case "logs": {
        const lines = Number(args.find((arg) => arg.startsWith("--lines="))?.slice(8) ?? 40);
        console.log(await tail(AGENT_LABEL, lines));
        break;
      }
      default:
        console.error(`unknown command: ${command}`);
        console.error(
          "usage: service [install [--only=agent|whisper] | uninstall | restart | status | logs [--lines=n]] [--json]",
        );
        process.exitCode = 2;
    }
  }
}
