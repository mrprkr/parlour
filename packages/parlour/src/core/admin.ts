import { freemem, totalmem } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Companions } from "./companions.ts";
import { type Config, loadConfig, parseConfig, writeConfig } from "./config.ts";
import { programMemoryVerdict } from "./guardrails.ts";
import type { Paths } from "./paths.ts";
import type { Check, ServiceManager, ServiceSpec, ServiceState } from "./ports.ts";
import { AGENT_LABEL, LLM_LABEL, localModelMemory, WHISPER_LABEL } from "./services.ts";
import { VERSION } from "./version.ts";

/**
 * The server, managed from somewhere other than the Mac it runs on: the
 * pipeline's knobs, the model servers it keeps warm, and the maintenance a
 * person would otherwise walk over to the Mac and type. The HTTP routes in
 * `server/` and `parlour remote` are thin; everything that decides what a
 * client may do is here, so it is decided once and tested once.
 *
 * A client can already turn the heating on, so the token that lets it ask
 * questions lets it do this too. What it cannot do is take the Mac down: the
 * pipeline's numbers are bounded, a model too big for the machine is refused,
 * one action runs at a time, and the same one cannot be repeated in a loop.
 */

/** `parlour start` exits with this to be started again, by launchd or by the app. */
export const RESTART_EXIT_CODE = 75;

/** The model servers a client may start and stop, by the name it uses for them. */
export const MANAGED_SERVICES = { llm: LLM_LABEL, whisper: WHISPER_LABEL } as const;
export type ServiceName = keyof typeof MANAGED_SERVICES;
export type ServiceAction = "start" | "stop" | "restart";
export const SERVICE_NAMES = Object.keys(MANAGED_SERVICES) as ServiceName[];
export const SERVICE_ACTIONS: readonly ServiceAction[] = ["start", "stop", "restart"];

/**
 * What a client may change, and how far. The bounds are tighter than the
 * config file's own: every request that runs at once is a generation the
 * local model holds in memory, and a timeout of an hour is a queue that
 * never drains.
 */
export const PipelinePatch = z
  .object({
    concurrency: z.number().int().min(1).max(4).optional(),
    queueDepth: z.number().int().min(1).max(10).optional(),
    triage: z.enum(["auto", "always", "never"]).optional(),
    maxTasks: z.number().int().min(1).max(10).optional(),
    timeoutMs: z.number().int().min(5_000).max(300_000).optional(),
  })
  .strict();
export type PipelinePatch = z.infer<typeof PipelinePatch>;

/** How long after one action on a service or the agent before the same one is taken again. */
const COOLDOWN_MS = 15_000;
/** Long enough for the reply to reach the client before the agent goes down. */
const RESTART_DELAY_MS = 500;
/** More than this and a log is something to read on the Mac, not over the network. */
export const MAX_LOG_LINES = 200;

/** A request the admin refused, and the HTTP status that says why. */
export class AdminError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ManagedService {
  name: ServiceName;
  what: string;
  /** Whether this server's config runs it at all. */
  configured: boolean;
  installed: boolean;
  running: boolean;
  pid: number | null;
  lastExit: number | null;
  /** Stopped by a client, or left down after crashing too often. Sandbox only. */
  held: boolean;
}

/**
 * "automatic" when the agent comes back by itself after it exits (launchd,
 * or the app that started it), "manual" when it was started in a terminal
 * and would simply stop.
 */
export type RestartMode = "automatic" | "manual";

export interface AdminStatus {
  version: string;
  role: Config["role"];
  restart: RestartMode;
  /** The pipeline the agent is running with. */
  pipeline: Config["pipeline"];
  /** The pipeline in the config file, which differs until the agent restarts. */
  saved: Config["pipeline"];
  services: ManagedService[];
  memory: { totalGb: number; freeGb: number };
}

export interface AdminDeps {
  /** The config the agent was built from, which is the one in force. */
  config: Config;
  paths: Paths;
  manager: ServiceManager;
  /** What this config would install, from `serviceSpecs`. */
  specs: ServiceSpec[];
  /** The model servers `parlour start` runs itself, inside the sandbox. Null elsewhere. */
  companions: Companions | null;
  /** The running agent's own checks. */
  doctor: () => Promise<Check[]>;
  /** Ends the agent so it is started again, or null when nothing would start it. */
  restartSelf: (() => void) | null;
  now?: () => number;
  cooldownMs?: number;
  /** The machine's memory in bytes, replaceable so a test need not own a very large model. */
  totalMemory?: number;
}

export class Admin {
  readonly #deps: AdminDeps;
  readonly #now: () => number;
  readonly #cooldown: number;
  readonly #last = new Map<string, number>();
  #busy = false;
  #restarting = false;

  constructor(deps: AdminDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? Date.now;
    this.#cooldown = deps.cooldownMs ?? COOLDOWN_MS;
  }

  async status(): Promise<AdminStatus> {
    const { config } = this.#deps;
    return {
      version: VERSION,
      role: config.role,
      restart: this.#deps.restartSelf ? "automatic" : "manual",
      pipeline: config.pipeline,
      saved: this.#saved().pipeline,
      services: await Promise.all(SERVICE_NAMES.map((name) => this.#state(name))),
      memory: { totalGb: round(totalmem() / 1024 ** 3), freeGb: round(freemem() / 1024 ** 3) },
    };
  }

  /**
   * Saves the change to the config file and, where the agent comes back on
   * its own, restarts it so the change is in force. The pipeline is read
   * once, when the agent is built, like everything else in the file.
   */
  async setPipeline(
    input: unknown,
    options: { apply?: boolean } = {},
  ): Promise<{
    pipeline: Config["pipeline"];
    restart: "scheduled" | "needed" | "none";
  }> {
    const parsed = PipelinePatch.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.join(".") || "pipeline";
      throw new AdminError(400, `${where}: ${issue?.message ?? "not a pipeline setting"}`);
    }
    return this.#exclusive(async () => {
      const { paths } = this.#deps;
      const { raw } = loadConfig(paths);
      const current = typeof raw.pipeline === "object" && raw.pipeline !== null ? raw.pipeline : {};
      const next = { ...raw, pipeline: { ...current, ...parsed.data } };
      // Checked against the whole schema before anything is written, so a
      // client cannot leave a file behind that the next start refuses.
      const pipeline = parseConfig(next).pipeline;
      writeConfig(paths, next);

      if (sameShape(pipeline, this.#deps.config.pipeline)) return { pipeline, restart: "none" };
      if (options.apply === false || !this.#deps.restartSelf) return { pipeline, restart: "needed" };
      this.#scheduleRestart();
      return { pipeline, restart: "scheduled" };
    });
  }

  /** Starts, stops or restarts one model server, and says where it ended up. */
  async service(name: string, action: string): Promise<ManagedService> {
    if (!isServiceName(name))
      throw new AdminError(404, `no service called ${name}; try ${SERVICE_NAMES.join(" or ")}`);
    if (!SERVICE_ACTIONS.includes(action as ServiceAction)) {
      throw new AdminError(
        400,
        `${action} is not something a service does; try ${SERVICE_ACTIONS.join(", ")}`,
      );
    }
    const label = MANAGED_SERVICES[name];
    const spec = this.#deps.specs.find((candidate) => candidate.label === label);
    if (!spec && action !== "stop") {
      throw new AdminError(
        404,
        `this server does not run ${name}: its config has no use for it, or its model is missing`,
      );
    }

    return this.#exclusive(async () => {
      if (spec && action !== "stop") {
        const verdict = programMemoryVerdict(spec.program, this.#deps.totalMemory);
        if (verdict?.status === "refuse") throw new AdminError(409, verdict.detail);
      }
      // Per action, so a stop straight after a start that went wrong is not refused.
      this.#throttle(`service:${name}:${action}`);
      const { companions, manager } = this.#deps;
      if (companions) {
        if (!companions.control(label, action as ServiceAction)) {
          throw new AdminError(404, `this server does not run ${name}`);
        }
      } else if (spec) {
        const [state] = await manager.status([spec]).catch(refused);
        if (!state?.installed) {
          throw new AdminError(
            409,
            `${spec.what} is not installed as a service. parlour service install on the server sets it up`,
          );
        }
        // launchd has no "start" for a job it was told to stop, only loading it again.
        if (action === "stop") await manager.stop([spec]).catch(refused);
        else await manager.restart([spec]).catch(refused);
      } else {
        await manager.stop([{ label, what: name, logPath: this.#logPath(name) }]).catch(refused);
      }
      return this.#state(name);
    });
  }

  /** The last lines of one log. The agent's own is "agent". */
  async logs(name: string, lines = 50): Promise<{ service: string; lines: string[] }> {
    if (name !== "agent" && !isServiceName(name)) {
      throw new AdminError(404, `no log called ${name}; try agent, ${SERVICE_NAMES.join(" or ")}`);
    }
    const count = Math.max(1, Math.min(MAX_LOG_LINES, Math.floor(lines) || 50));
    const text = await this.#deps.manager.tail(this.#logPath(name), count);
    return { service: name, lines: text.split("\n") };
  }

  async doctor(): Promise<Check[]> {
    return this.#exclusive(async () => {
      const checks = await this.#deps.doctor();
      const memory = localModelMemory(this.#deps.config, this.#deps.paths, this.#deps.totalMemory);
      if (memory) checks.push(memory);
      return checks;
    });
  }

  /** Restarts the agent itself, which is how a change to the config file takes effect. */
  restart(): { restart: "scheduled" } {
    if (!this.#deps.restartSelf) {
      throw new AdminError(
        409,
        "this agent was started in a terminal, so nothing would start it again. Restart it there",
      );
    }
    this.#throttle("agent");
    this.#scheduleRestart();
    return { restart: "scheduled" };
  }

  #scheduleRestart(): void {
    if (this.#restarting) return;
    this.#restarting = true;
    const restart = this.#deps.restartSelf;
    setTimeout(() => restart?.(), RESTART_DELAY_MS).unref?.();
  }

  /** One action at a time: two clients restarting the model at once is how a Mac runs out of memory. */
  async #exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.#restarting) throw new AdminError(503, "the agent is restarting; ask again in a moment");
    if (this.#busy)
      throw new AdminError(409, "another change is still being made; try again when it is done");
    this.#busy = true;
    try {
      return await work();
    } finally {
      this.#busy = false;
    }
  }

  #throttle(key: string): void {
    const now = this.#now();
    const last = this.#last.get(key);
    if (last !== undefined && now - last < this.#cooldown) {
      const wait = Math.ceil((this.#cooldown - (now - last)) / 1000);
      throw new AdminError(429, `that was done a moment ago; try again in ${wait}s`);
    }
    this.#last.set(key, now);
  }

  #saved(): Config {
    try {
      return loadConfig(this.#deps.paths).config;
    } catch {
      // A file someone broke by hand since the agent started: what is in force is the honest answer.
      return this.#deps.config;
    }
  }

  #logPath(name: ServiceName | "agent"): string {
    const label = name === "agent" ? AGENT_LABEL : MANAGED_SERVICES[name];
    const spec = this.#deps.specs.find((candidate) => candidate.label === label);
    const file = name === "llm" ? "llm.log" : name === "whisper" ? "whisper.log" : "agent.log";
    return spec?.logPath ?? join(this.#deps.paths.logsDir, file);
  }

  async #state(name: ServiceName): Promise<ManagedService> {
    const label = MANAGED_SERVICES[name];
    const spec = this.#deps.specs.find((candidate) => candidate.label === label);
    const what = spec?.what ?? (name === "llm" ? "the local model" : "whisper, kept warm");
    const companion = this.#deps.companions?.states().find((state) => state.label === label);
    if (companion) {
      return {
        name,
        what,
        configured: true,
        installed: true,
        running: companion.running,
        pid: companion.pid,
        lastExit: null,
        held: companion.held,
      };
    }
    let state: ServiceState | undefined;
    try {
      [state] = await this.#deps.manager.status([{ label, what, logPath: this.#logPath(name) }]);
    } catch {
      state = undefined;
    }
    return {
      name,
      what,
      configured: Boolean(spec),
      installed: state?.installed ?? false,
      running: state?.running ?? false,
      pid: state?.pid ?? null,
      lastExit: state?.lastExit ?? null,
      held: false,
    };
  }
}

/** A service manager that cannot do this here (no launchd, the sandbox) says why, and the client hears it. */
function refused(error: unknown): never {
  throw new AdminError(409, error instanceof Error ? error.message : String(error));
}

function isServiceName(name: string): name is ServiceName {
  return Object.hasOwn(MANAGED_SERVICES, name);
}

function sameShape(a: object, b: object): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
