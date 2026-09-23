import "../core/builtins.ts";
import { buildAgent } from "../core/agent.ts";
import { type Config, loadConfig } from "../core/config.ts";
import { emit } from "../core/events.ts";
import { logger } from "../core/logger.ts";
import type { Paths } from "../core/paths.ts";
import type { Check, Diagnosable } from "../core/ports.ts";
import { type ProviderContextFactory, type ProviderKind, resolveProvider } from "../core/providers.ts";
import { sandboxed } from "../core/sandbox.ts";
import { loadSecrets, type Secrets } from "../core/secrets.ts";
import { AGENT_LABEL, serviceSpecs } from "../core/services.ts";
import { connectorStore } from "../integrations/connectors/store.ts";
import { pickServiceManager } from "../providers/service/index.ts";
import { findServer } from "../server/discovery.ts";
import { type Command, parseCli } from "./args.ts";
import { formatChecks, printJson } from "./output.ts";
import { describeState, parlourBin } from "./service.ts";

const USAGE = ["parlour doctor [--json]   exit 1 when something it needs is broken"];

/**
 * Checks every moving part and says which one is broken. They fail in ways
 * that look identical from the outside: the agent hears you and says
 * nothing. This turns that into one line naming the thing to fix. `init`
 * runs it last, and the desktop app runs it behind its Check button.
 *
 * Core knows three things the providers cannot: whether the config parses,
 * whether the network is let in, and whether anything keeps the agent
 * running. Everything else is asked of the provider that would break.
 */
export async function diagnose(paths: Paths): Promise<Check[]> {
  const checks: Check[] = [];

  let config: Config;
  try {
    const loaded = loadConfig(paths);
    config = loaded.config;
    checks.push({
      name: "config",
      status: loaded.exists ? "ok" : "warn",
      detail: loaded.exists
        ? paths.configFile
        : `${paths.configFile} does not exist, using defaults. parlour init`,
    });
  } catch (error) {
    // Nothing below can be trusted without a config, so this is the whole report.
    checks.push({
      name: "config",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
    return checks;
  }
  const secrets = loadSecrets(paths);

  if (config.role === "satellite") checks.push(...(await satellite(config, secrets, paths)));
  else checks.push(...(await server(config, secrets, paths)));

  checks.push(await service(config, paths));
  return checks;
}

async function server(config: Config, secrets: Secrets, paths: Paths): Promise<Check[]> {
  const checks: Check[] = [];
  if (config.server.enabled && config.server.host !== "127.0.0.1") {
    checks.push({
      name: "network",
      status: secrets.token ? "ok" : "warn",
      detail: secrets.token
        ? `PARLOUR_TOKEN is set, so the house can reach port ${config.server.port}`
        : `PARLOUR_TOKEN is not set, so the server answers this machine only. parlour secrets set PARLOUR_TOKEN`,
    });
  }
  checks.push(...(await forgottenConnectors(config, paths)));
  try {
    const agent = await buildAgent(config, secrets, paths, { audio: false });
    try {
      checks.push(...(await agent.doctor()));
    } finally {
      await agent.close();
    }
  } catch (error) {
    checks.push({
      name: "providers",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  return checks;
}

/**
 * `parlour connectors add` writes `connectors.json` and never `config.json`,
 * so a config written before connectors were on by default can list an
 * account the model will never see. No provider can say so, because the one
 * that would is the one that is not loaded, which is why core asks.
 */
export async function forgottenConnectors(config: Config, paths: Paths): Promise<Check[]> {
  if ("connectors" in config.integrations) return [];
  const listed = await connectorStore(paths).list();
  if (listed.length === 0) return [];
  return [
    {
      name: "connectors",
      status: "warn",
      detail:
        `${listed.map((connector) => connector.name).join(", ")} in ${paths.connectorsFile}, ` +
        `but integrations.connectors is not in ${paths.configFile}, so the model never sees them. ` +
        `Add "connectors": {} under integrations.`,
    },
  ];
}

/**
 * A satellite has no models, tools or keys of its own to check. What it
 * needs is a microphone, a speaker, the server and the token that lets it in.
 */
async function satellite(config: Config, secrets: Secrets, paths: Paths): Promise<Check[]> {
  const checks: Check[] = [];
  const context: ProviderContextFactory = (definition) => ({
    paths,
    secrets,
    log: logger(definition.name),
    emit,
    config,
  });
  const ask = async (kind: ProviderKind, name: string, slice: unknown) => {
    try {
      const part = await resolveProvider<Diagnosable>(kind, name, slice, context);
      checks.push(...((await part.doctor?.()) ?? []));
    } catch (error) {
      checks.push({ name, status: "fail", detail: error instanceof Error ? error.message : String(error) });
    }
  };
  await ask("audioSource", config.audio.source, config.audio);
  await ask("audioSink", config.audio.sink, config.audio);
  if (config.satellite.localWake) await ask("wake", config.wake.provider, config.wake);

  const target = config.satellite.serverUrl || (await findServer(4000))?.url;
  const up = Boolean(target) && (await reachable(`${target}/health`));
  checks.push({
    name: "the server",
    status: up ? "ok" : "fail",
    detail: target
      ? `${target}${up ? "" : ". A failure here is the server being down, or this network dropping multicast."}`
      : "nothing is advertising _parlour._tcp. Is the server running, and on this network?",
  });
  checks.push({
    name: "access token",
    status: secrets.token ? "ok" : "fail",
    detail: secrets.token
      ? "set, and it has to be the same one the server has"
      : "PARLOUR_TOKEN is not set, so the server will refuse this satellite. parlour secrets set PARLOUR_TOKEN",
  });
  return checks;
}

/** Whether something keeps it alive, which is the difference between a thing that runs and a thing that keeps running. */
async function service(config: Config, paths: Paths): Promise<Check> {
  if (sandboxed()) {
    return { name: "service", status: "ok", detail: "kept running by the app, inside its sandbox" };
  }
  try {
    const specs = await serviceSpecs(config, paths, parlourBin());
    const states = await pickServiceManager().status(specs);
    const agent = states.find((state) => state.label === AGENT_LABEL);
    return {
      name: "service",
      status: agent?.running ? "ok" : "warn",
      detail: agent?.running
        ? describeState(agent)
        : agent?.installed
          ? `${describeState(agent)}. parlour service logs`
          : "not installed. parlour service install, or let the menu bar app own it.",
    };
  } catch (error) {
    return {
      name: "service",
      status: "warn",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function reachable(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(4000) })).ok;
  } catch {
    return false;
  }
}

export const command: Command = {
  name: "doctor",
  summary: "Check every moving part and name the broken one.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { values } = parseCli(argv, { json: { type: "boolean" } });
    const checks = await diagnose(paths);
    const broken = checks.filter((check) => check.status === "fail").length;
    if (values.json) {
      printJson(checks);
    } else {
      process.stdout.write(`${formatChecks(checks)}\n\n`);
      process.stdout.write(broken ? `${broken} thing(s) to fix.\n` : "Everything Parlour needs is up.\n");
    }
    if (broken) process.exitCode = 1;
  },
};
