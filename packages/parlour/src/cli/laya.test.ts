import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { resolvePaths } from "../core/paths.ts";
import { parseSkill } from "../core/skills.ts";
import { layaProject, layaStatus, SKILL, unsupported } from "./laya.ts";
import { putMcpServer } from "./mcp.ts";

const home = mkdtempSync(join(tmpdir(), "parlour-laya-"));
after(() => rmSync(home, { recursive: true, force: true }));

test("laya runs on Apple silicon outside the sandbox and nowhere else", () => {
  assert.equal(unsupported("darwin", "arm64", false), null);
  assert.match(unsupported("darwin", "x64", false) ?? "", /Apple silicon/);
  assert.match(unsupported("linux", "arm64", false) ?? "", /Apple silicon/);
  assert.match(unsupported("darwin", "arm64", true) ?? "", /App Store/);
});

test("the laya project is found beside a built cli, and in a checkout run from source", () => {
  const root = join(home, "project");
  const cli = join(root, "dist", "cli");
  mkdirSync(cli, { recursive: true });
  assert.equal(layaProject(cli), null);

  const shipped = join(root, "dist", "laya");
  mkdirSync(shipped, { recursive: true });
  writeFileSync(join(shipped, "pyproject.toml"), "");
  writeFileSync(join(shipped, "uv.lock"), "");
  assert.equal(layaProject(cli), join(cli, "..", "laya"));

  // packages/parlour/src/cli sits three below packages/, where packages/laya is.
  const source = join(root, "packages", "parlour", "src", "cli");
  mkdirSync(source, { recursive: true });
  const checkout = join(root, "packages", "laya");
  mkdirSync(checkout, { recursive: true });
  writeFileSync(join(checkout, "pyproject.toml"), "");
  writeFileSync(join(checkout, "uv.lock"), "");
  assert.equal(layaProject(source), join(source, "..", "..", "..", "laya"));
});

test("the skill the house is given parses as a skill", () => {
  const skill = parseSkill(SKILL, "deciding-with-laya.md");
  assert.ok("name" in skill, "detail" in skill ? skill.detail : "");
  assert.equal(skill.name, "deciding-with-laya");
});

test("the laya MCP server replaces its own entry and keeps the house's integrations", () => {
  const raw: Record<string, unknown> = {};
  const server = { transport: "stdio" as const, command: "python", args: ["mcp_server.py"], env: {} };
  putMcpServer(raw, "laya", server);
  const integrations = raw.integrations as Record<string, unknown>;
  assert.ok("home-assistant" in integrations);
  assert.throws(() => putMcpServer(raw, "laya", server), /already/);
  putMcpServer(raw, "laya", { ...server, command: "other" }, true);
  assert.equal(
    (integrations.mcp as { servers: { laya: { command: string } } }).servers.laya.command,
    "other",
  );
});

test("status says nothing is set up in a fresh home", async () => {
  const paths = resolvePaths({ HOME: join(home, "fresh"), PARLOUR_HOME: join(home, "fresh") });
  const status = await layaStatus(paths);
  assert.equal(status.ready, false);
  assert.equal(status.mcp, false);
  assert.equal(status.skill, false);
  assert.equal(status.decision, "none");
});
