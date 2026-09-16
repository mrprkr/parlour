import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { loadConfig, type Config } from "./config.ts";
import { ConnectorStore } from "./connectors/store.ts";
import { findServer } from "./discovery/index.ts";
import { statusAll, AGENT_LABEL } from "./service.ts";

/**
 * Checks every moving part the agent depends on and says which one is broken.
 *
 * There are six of them and they fail in ways that look identical from the
 * outside: the agent hears you and says nothing. `pnpm run doctor` is what turns
 * that into one line naming the thing to fix. The installer runs it at the
 * end, and the desktop app runs it behind its Check button.
 */

const run = promisify(execFile);

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** False when the agent still works without it, in a reduced way. */
  required: boolean;
}

export async function diagnose(configPath?: string): Promise<Check[]> {
  const { config, secrets } = loadConfig(configPath ?? process.env.AGENT_CONFIG ?? "agent.config.json");
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, required = true) =>
    checks.push({ name, ok, detail, required });

  add("ffmpeg", await onPath("ffmpeg"), "brew install ffmpeg. It is how the microphone is read.");

  if (config.role === "satellite") {
    const target = config.satellite.serverUrl || (await findServer(4000))?.url;
    add(
      "the server",
      Boolean(target) && (await reachable(`${target}/health`)),
      target
        ? `${target}. A failure here is the server being down, or this network dropping multicast.`
        : "nothing is advertising _home-agent._tcp. Is the server running, and on this network?",
    );
    add(
      "access token",
      Boolean(secrets.agentToken),
      secrets.agentToken
        ? "set, and it has to be the same one the server has"
        : "AGENT_TOKEN is not set in .env, so the server will refuse this satellite.",
    );
    if (config.satellite.localWake) add(...wakeModels(config));
    add(...serviceCheck(await statusAll(process.cwd())));
    return checks;
  }

  add(...wakeModels(config));

  add(
    "whisper server",
    await reachable(config.stt.url.replace(/\/inference$/, "/")),
    `${config.stt.url}. Start it with sh scripts/whisper-server.sh.`,
  );

  const models = await json<{ data?: { id?: string }[] }>(`${config.llm.local.baseUrl}/models`);
  const ids = (models?.data ?? []).map((m) => m.id ?? "");
  add(
    "local model",
    ids.includes(config.llm.local.model),
    models
      ? ids.length
        ? `served: ${ids.join(", ")}. Configured: ${config.llm.local.model}.`
        : "the server is up but has no model loaded."
      : `${config.llm.local.baseUrl} is not answering. Start the server in LM Studio.`,
  );

  add(
    "Home Assistant",
    secrets.haToken ? await reachable(`${config.homeAssistant.baseUrl}/api/`, secrets.haToken) : false,
    secrets.haToken
      ? `${config.homeAssistant.baseUrl}. A failure here is usually the token.`
      : "HA_TOKEN is not set in .env, so the house is out of reach.",
  );

  add(
    "cloud escalation",
    Boolean(secrets.anthropicKey) && config.llm.cloud.enabled,
    secrets.anthropicKey
      ? config.llm.cloud.enabled
        ? `${config.llm.cloud.model}`
        : "disabled in agent.config.json."
      : "ANTHROPIC_API_KEY is not set. The agent runs local only.",
    false,
  );

  if (config.server.enabled) {
    const reachableServer = await reachable(`http://127.0.0.1:${config.server.port}/health`);
    add(
      "network",
      reachableServer,
      reachableServer
        ? secrets.agentToken
          ? `port ${config.server.port}, and the house can reach it`
          : `port ${config.server.port}, loopback only: set AGENT_TOKEN to let the house in`
        : `nothing is listening on port ${config.server.port}. That is expected when the agent is not running.`,
      false,
    );
  }

  add(...serviceCheck(await statusAll(process.cwd())));

  if (config.server.enabled && config.discovery.enabled) {
    const found = await findServer(4000);
    add(
      "discoverable",
      Boolean(found),
      found
        ? `advertised as "${found.name}" at ${found.url}`
        : "nothing is advertising _home-agent._tcp yet, which is expected while the agent is stopped.",
      false,
    );
  }

  const connectors = await new ConnectorStore(config.connectorsFile).list();
  if (connectors.length) {
    const store = new ConnectorStore(config.connectorsFile);
    const out: string[] = [];
    for (const connector of connectors) {
      if (!(await store.secrets(connector.name)).tokens) out.push(connector.name);
    }
    add(
      "connectors",
      out.length === 0,
      out.length
        ? `signed out: ${out.join(", ")}. Run pnpm connectors add <name> <url> again.`
        : `${connectors.length} connected`,
      false,
    );
  }

  if (config.search.provider === "searxng") {
    add(
      "SearXNG",
      await reachable(`${config.search.searxngUrl}/`),
      `${config.search.searxngUrl}. Only the local model uses it; the cloud one searches for itself.`,
      false,
    );
  }

  return checks;
}

/** Used by both roles, because a satellite with local wake needs them too. */
function wakeModels(config: Config): [string, boolean, string] {
  const dir = config.wake.modelDir;
  const missing = ["melspectrogram.onnx", "embedding_model.onnx", ...config.wake.words.map((w) => `${w}.onnx`)]
    .filter((file) => !existsSync(join(dir, file)));
  return [
    "wake word models",
    missing.length === 0,
    missing.length ? `missing from ${dir}: ${missing.join(", ")}. Run pnpm models.` : dir,
  ];
}

/** Whether launchd is keeping it alive, which is the difference between a
 * thing that runs and a thing that keeps running. */
function serviceCheck(states: Awaited<ReturnType<typeof statusAll>>): [string, boolean, string, boolean] {
  const agent = states.find((service) => service.label === AGENT_LABEL);
  return [
    "service",
    Boolean(agent?.running),
    agent?.running
      ? `running as pid ${agent.pid}, and it starts at login`
      : agent?.installed
        ? `installed but not running${agent.lastExit ? `, last exit ${agent.lastExit}` : ""}. pnpm service logs.`
        : "not installed. pnpm service install, or let the menu bar app own it.",
    false,
  ];
}

async function onPath(binary: string): Promise<boolean> {
  try {
    await run("which", [binary]);
    return true;
  } catch {
    return false;
  }
}

async function reachable(url: string, token?: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** `pnpm run doctor`, and the same output the installer prints at the end. */
if (process.argv[1]?.endsWith("doctor.ts")) {
  const checks = await diagnose();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(checks));
  } else {
    for (const check of checks) {
      const mark = check.ok ? "ok  " : check.required ? "FAIL" : "warn";
      console.log(`${mark}  ${check.name.padEnd(18)} ${check.detail}`);
    }
    const broken = checks.filter((c) => !c.ok && c.required);
    console.log(broken.length ? `\n${broken.length} thing(s) to fix.` : "\nEverything the agent needs is up.");
  }
  // Not process.exit: stdout to a pipe is asynchronous, and exiting here
  // truncates the report when the doctor is run through pnpm or the app.
  process.exitCode = checks.some((c) => !c.ok && c.required) ? 1 : 0;
}
