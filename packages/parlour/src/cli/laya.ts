import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, updateConfig } from "../core/config.ts";
import type { Paths } from "../core/paths.ts";
import { findOnPath } from "../core/process.ts";
import { sandboxed } from "../core/sandbox.ts";
import { type Command, parseCli, subcommand } from "./args.ts";
import { putMcpServer } from "./mcp.ts";
import { humanReporter, porcelainReporter, printJson, type Reporter } from "./output.ts";
import { stream } from "./setup.ts";

const USAGE = [
  "parlour laya setup [--no-deps] [--porcelain]   the laya-mlx environment, its checkpoint, the MCP server and skill",
  "parlour laya status [--json]                   what of that is in place",
];

const SUBCOMMANDS = ["setup", "status"] as const;

/** The English FP16 checkpoint, the one the decision provider defaults to. */
const CHECKPOINT = "aac6fef/laya-mlx";
/** The files that make the pinned environment: uv reads the first two, the third is the MCP server. */
const PROJECT_FILES = ["pyproject.toml", "uv.lock", "mcp_server.py"];
const SKILL_NAME = "deciding-with-laya";
const MCP_NAME = "laya";

/**
 * Where the pinned project comes from. An npm install carries a copy in
 * `dist/laya`, which the build takes from `packages/laya`; a checkout, run
 * from source, reads `packages/laya` itself. Null when neither is there.
 */
export function layaProject(here = dirname(fileURLToPath(import.meta.url))): string | null {
  for (const dir of [join(here, "..", "laya"), join(here, "..", "..", "..", "laya")]) {
    if (existsSync(join(dir, "pyproject.toml")) && existsSync(join(dir, "uv.lock"))) return dir;
  }
  return null;
}

/**
 * The environment lives in the cache beside the other models: it is large,
 * it is Parlour's rather than the person's, and it can always be made again.
 */
export function layaDir(paths: Paths): string {
  return join(paths.cacheDir, "laya");
}

export function layaPython(paths: Paths): string {
  return join(layaDir(paths), ".venv", "bin", "python");
}

/** Why laya cannot run here, or null when it can. MLX is Apple silicon only. */
export function unsupported(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  inSandbox = sandboxed(),
): string | null {
  if (platform !== "darwin" || arch !== "arm64") return "laya-mlx needs a Mac with Apple silicon.";
  // uv fetches Python and wheels into places the App Store sandbox does not
  // allow, and there is no Homebrew in there to bring uv.
  if (inSandbox) return "laya-mlx is not available in the App Store copy of Parlour.";
  return null;
}

export interface LayaStatus {
  supported: boolean;
  /** Why not, when it is not. */
  reason: string | null;
  uv: string | null;
  /** The environment has been made. */
  ready: boolean;
  python: string;
  /** The decision provider the config names. */
  decision: string;
  mcp: boolean;
  skill: boolean;
}

export async function layaStatus(paths: Paths): Promise<LayaStatus> {
  const reason = unsupported();
  const { config } = loadConfig(paths);
  const servers = (config.integrations.mcp as { servers?: Record<string, unknown> } | undefined)?.servers;
  return {
    supported: reason === null,
    reason,
    uv: await findOnPath("uv"),
    ready: existsSync(layaPython(paths)),
    python: layaPython(paths),
    decision: config.llm.decision.provider,
    mcp: Boolean(servers && MCP_NAME in servers),
    skill: existsSync(join(paths.skillsDir, `${SKILL_NAME}.md`)),
  };
}

/**
 * Everything laya needs, in the order it is needed: uv, the pinned
 * environment, the checkpoint, and then the three places the house uses it.
 * Safe to run again: uv leaves an environment that matches its lock alone,
 * the checkpoint is only fetched once, and the skill is written only when
 * there is none, so one edited by hand is kept.
 *
 * The decision provider goes in as `shadow`, which logs what laya would have
 * decided and changes nothing, unless a mode is already set.
 */
export async function setupLaya(paths: Paths, deps: boolean, report: Reporter): Promise<boolean> {
  report.step("Laya");
  const reason = unsupported();
  if (reason) {
    report.fail(reason);
    return false;
  }
  const project = layaProject();
  if (!project) {
    report.fail("This copy of parlour has no laya project in it. Reinstall parlour.");
    return false;
  }

  let uv = await findOnPath("uv");
  if (!uv && deps) {
    report.ok("installing uv with Homebrew");
    if ((await stream("brew", ["install", "uv"], report)) === 0) uv = await findOnPath("uv");
  }
  if (!uv) {
    report.fail("laya needs uv, and it is not installed. brew install uv");
    return false;
  }
  report.ok(uv);

  const dir = layaDir(paths);
  mkdirSync(dir, { recursive: true });
  // Ours and versioned with parlour, so they are replaced on every run: an
  // upgrade that moves the pin moves the environment with it.
  for (const file of PROJECT_FILES) copyFileSync(join(project, file), join(dir, file));

  report.ok("making the Python environment, which fetches MLX the first time");
  if ((await stream(uv, ["sync", "--frozen", "--directory", dir], report)) !== 0) {
    report.fail("uv could not make the environment. The details say why.");
    return false;
  }

  report.ok(`fetching ${CHECKPOINT}`);
  if (
    (await stream(uv, ["run", "--frozen", "--directory", dir, "hf", "download", CHECKPOINT], report)) !== 0
  ) {
    report.fail(`could not fetch ${CHECKPOINT}. It is fetched on first use instead.`);
    return false;
  }

  const python = layaPython(paths);
  updateConfig(paths, (raw) => {
    const llm = record(raw, "llm");
    const decision = record(llm, "decision");
    decision.provider = "laya-mlx";
    decision.mode ??= "shadow";
    decision.python = python;
    putMcpServer(
      raw,
      MCP_NAME,
      { transport: "stdio", command: python, args: [join(dir, "mcp_server.py")], env: {} },
      true,
    );
  });
  report.ok("the decision model is laya-mlx, in shadow mode until you choose triage");
  report.ok(`the ${MCP_NAME} MCP server gives the model choose, rate, check and decide`);

  const skill = join(paths.skillsDir, `${SKILL_NAME}.md`);
  if (existsSync(skill)) {
    report.ok(`kept your ${SKILL_NAME} skill`);
  } else {
    mkdirSync(paths.skillsDir, { recursive: true });
    writeFileSync(skill, SKILL);
    report.ok(`the ${SKILL_NAME} skill says when laya is worth asking`);
  }
  return true;
}

/** An object under `key`, made if missing, so a write never lands on a string or an array. */
function record(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  const made: Record<string, unknown> = {};
  parent[key] = made;
  return made;
}

/**
 * The house's copy of the rule, written for the local model rather than for
 * a developer: short, because every word of it is read on the way to an
 * answer someone is waiting to hear.
 */
export const SKILL = `---
name: ${SKILL_NAME}
description: When to use the laya tools (choose, rate, check, decide) to sort or label a piece of text quickly, and how far to trust the answer.
---

Laya is a small classifier on this Mac. It reads a short text and picks between answers you give it. It does not know facts, do sums or reason, and it is not a safety check.

Use it for sorting and labelling: which room or device a request is about, what kind of request it is, how urgent it sounds. Do not use it for anything you can answer yourself, for facts, or to decide whether something is safe to do.

- One text, several questions: call decide once. One question: choose, rate or check.
- Always offer an "other" answer, and describe each answer in a few words.
- Pass only the sentence or two that matter, never a whole conversation.
- Prefer choose or rate to check: check leans towards no.
- Read the confidence. Below about 0.1 it is unsure, so decide yourself. Do not ask again in other words to get a different answer.
`;

export const command: Command = {
  name: "laya",
  summary: "Set up laya-mlx: on-device decisions, its MCP server and its skill.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, {
      json: { type: "boolean" },
      porcelain: { type: "boolean" },
      "no-deps": { type: "boolean" },
    });
    const sub = subcommand(positionals, SUBCOMMANDS, USAGE);
    if (sub === "status") {
      const status = await layaStatus(paths);
      if (values.json) {
        printJson(status);
        return;
      }
      process.stdout.write(
        status.supported
          ? `${status.ready ? "ready" : "not set up"}, decision ${status.decision}, ` +
              `MCP server ${status.mcp ? "on" : "off"}, skill ${status.skill ? "written" : "absent"}\n`
          : `${status.reason}\n`,
      );
      return;
    }

    const report = values.porcelain ? porcelainReporter() : humanReporter();
    const ok = await setupLaya(paths, values["no-deps"] !== true, report);
    report.done(!ok);
    if (!ok) process.exitCode = 1;
    else if (!report.porcelain) process.stdout.write("\nparlour restart to pick it up.\n");
  },
};
