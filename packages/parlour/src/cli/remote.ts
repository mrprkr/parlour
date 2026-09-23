import type { AdminStatus, ManagedService } from "../core/admin.ts";
import { type Config, loadConfig } from "../core/config.ts";
import type { Check } from "../core/ports.ts";
import { loadSecrets } from "../core/secrets.ts";
import { type Command, parseCli, subcommand, UsageError } from "./args.ts";
import { formatChecks, printJson, table } from "./output.ts";

const USAGE = [
  "parlour remote status                           the server's services, pipeline and memory",
  "parlour remote pipeline                         the pipeline in force, and the one saved",
  "parlour remote pipeline set key=value...        change it, and restart the agent so it takes effect",
  "parlour remote service <llm|whisper> <start|stop|restart>",
  "parlour remote doctor                           the server's own checks",
  "parlour remote logs [agent|llm|whisper] [--lines N]",
  "parlour remote restart                          restart the agent on the server",
  "  --url http://host:8765   the server; otherwise satellite.serverUrl, then this Mac",
  "  --token T                otherwise PARLOUR_TOKEN from this machine's secrets",
  "  --no-apply               with pipeline set: save it, and leave the restart for later",
  "  --json                   one JSON document, for a script",
];

const SUBCOMMANDS = ["status", "pipeline", "service", "doctor", "logs", "restart"] as const;

/** The pipeline keys `pipeline set` takes, and which of them are numbers. */
const NUMERIC = new Set(["concurrency", "queueDepth", "maxTasks", "timeoutMs"]);
const KEYS = new Set([...NUMERIC, "triage"]);

export interface Remote {
  url: string;
  token: string | undefined;
}

/**
 * Where the server is: what was typed, what this machine pinned as a
 * satellite, or this machine itself. Never whatever Bonjour turns up first:
 * the token goes with every call, and anything on the network can advertise
 * `_parlour._tcp` to collect it. The satellite only trusts discovery once, and
 * pins what it found; this has no such moment, so it asks to be told.
 */
export function resolveRemote(
  config: Config,
  flags: { url?: string; token?: string },
  secretToken: string | undefined,
): Remote {
  const token = flags.token || secretToken || undefined;
  const typed = flags.url || config.satellite.serverUrl;
  if (typed) return { url: typed.replace(/\/+$/, ""), token };
  return { url: `http://127.0.0.1:${config.server.port}`, token };
}

/** One call to an admin route. A refusal is the server's own sentence, not a status code. */
export async function call<T>(
  remote: Remote,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${remote.url}${path}`, {
      method,
      headers: {
        ...(remote.token ? { authorization: `Bearer ${remote.token}` } : {}),
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new Error(
      `could not reach ${remote.url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401) {
    throw new Error(`${remote.url} wants the token. --token, or PARLOUR_TOKEN in parlour secrets`);
  }
  if (!response.ok) throw new Error(payload.error ?? `${remote.url} answered ${response.status}`);
  return payload;
}

/** `key=value` pairs to a pipeline patch, typed the way the server checks them. */
export function parseSettings(pairs: string[]): Record<string, string | number> {
  if (!pairs.length)
    throw new UsageError("say what to change, for example: parlour remote pipeline set triage=always");
  const patch: Record<string, string | number> = {};
  for (const pair of pairs) {
    const [key, value] = pair.split("=", 2);
    if (!key || value === undefined || !KEYS.has(key)) {
      throw new UsageError(`${pair} is not a pipeline setting; try ${[...KEYS].join(", ")}`);
    }
    if (NUMERIC.has(key)) {
      const number = Number(value);
      if (!Number.isInteger(number)) throw new UsageError(`${key} is a whole number`);
      patch[key] = number;
    } else {
      patch[key] = value;
    }
  }
  return patch;
}

function describeService(service: ManagedService): string {
  if (!service.configured) return "not run by this server";
  if (service.running) return `running${service.pid ? ` as pid ${service.pid}` : ""}`;
  if (service.held) return "stopped, and held stopped";
  if (!service.installed) return "not installed";
  return `stopped${service.lastExit ? `, last exit ${service.lastExit}` : ""}`;
}

function pipelineRows(inForce: Config["pipeline"], saved: Config["pipeline"]): string[][] {
  return (Object.keys(inForce) as (keyof Config["pipeline"])[]).map((key) => {
    const now = String(inForce[key]);
    const next = String(saved[key]);
    return [key, now, now === next ? "" : `${next} after a restart`];
  });
}

const restartNote: Record<string, string> = {
  scheduled: "The agent is restarting so the change takes effect.",
  needed: "Saved. It takes effect the next time the agent starts: parlour remote restart.",
  none: "Saved. That is what the agent is already running with.",
};

/**
 * The server, managed from another machine, or from this one without
 * editing a file: the same routes the iPhone app's Server screen uses.
 */
export const command: Command = {
  name: "remote",
  summary: "Manage a Parlour server from here: pipeline, model servers, maintenance.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, {
      url: { type: "string" },
      token: { type: "string" },
      lines: { type: "string" },
      json: { type: "boolean" },
      "no-apply": { type: "boolean" },
    });
    const sub = subcommand(positionals, SUBCOMMANDS, USAGE);
    const { config } = loadConfig(paths);
    const remote = resolveRemote(
      config,
      { url: values.url as string | undefined, token: values.token as string | undefined },
      loadSecrets(paths).token,
    );
    const json = values.json === true;
    const out = (value: unknown, text: () => string): void => {
      if (json) printJson(value);
      else process.stdout.write(`${text()}\n`);
    };

    switch (sub) {
      case "status": {
        const status = await call<AdminStatus>(remote, "GET", "/admin");
        return out(status, () =>
          [
            `${remote.url}: Parlour ${status.version}, ${status.role}, ${status.memory.freeGb} of ${status.memory.totalGb} GB free`,
            "",
            table(status.services.map((service) => [service.name, service.what, describeService(service)])),
            "",
            table(pipelineRows(status.pipeline, status.saved)),
          ].join("\n"),
        );
      }

      case "pipeline": {
        if (positionals[1] !== "set") {
          const status = await call<AdminStatus>(remote, "GET", "/admin");
          return out({ pipeline: status.pipeline, saved: status.saved }, () =>
            table(pipelineRows(status.pipeline, status.saved)),
          );
        }
        const patch = parseSettings(positionals.slice(2));
        const query = values["no-apply"] ? "?apply=false" : "";
        const result = await call<{ restart: string }>(remote, "POST", `/admin/pipeline${query}`, patch);
        return out(result, () => restartNote[result.restart] ?? "Saved.");
      }

      case "service": {
        const [, name, action] = positionals;
        if (!name || !action)
          throw new UsageError("parlour remote service <llm|whisper> <start|stop|restart>");
        const state = await call<ManagedService>(remote, "POST", "/admin/service", { service: name, action });
        return out(state, () => `${state.what}: ${describeService(state)}`);
      }

      case "doctor": {
        const { checks } = await call<{ checks: Check[] }>(remote, "POST", "/admin/doctor");
        if (checks.some((check) => check.status === "fail")) process.exitCode = 1;
        return out(checks, () => formatChecks(checks));
      }

      case "logs": {
        const service = positionals[1] ?? "agent";
        const lines = Number(values.lines) || 40;
        const logs = await call<{ lines: string[] }>(
          remote,
          "GET",
          `/admin/logs?service=${encodeURIComponent(service)}&lines=${lines}`,
        );
        return out(logs, () => logs.lines.join("\n"));
      }

      case "restart": {
        const result = await call<{ restart: string }>(remote, "POST", "/admin/restart");
        return out(result, () => restartNote[result.restart] ?? "Restarting.");
      }
    }
  },
};
