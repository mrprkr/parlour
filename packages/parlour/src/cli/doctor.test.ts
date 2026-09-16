import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { parseConfig } from "../core/config.ts";
import { resolvePaths } from "../core/paths.ts";
import { forgottenConnectors } from "./doctor.ts";

const home = mkdtempSync(join(tmpdir(), "parlour-doctor-"));
after(() => rmSync(home, { recursive: true, force: true }));

function pathsWith(dir: string, connectors?: string) {
  const paths = resolvePaths({ HOME: dir, PARLOUR_HOME: dir });
  if (connectors !== undefined) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(paths.connectorsFile, connectors);
  }
  return paths;
}

const listed = JSON.stringify([{ name: "calendar", url: "https://example.com/mcp", addedAt: "2026-01-01" }]);

test("the doctor warns when connectors.json lists an account the config never loads", async () => {
  const paths = pathsWith(join(home, "forgotten"), listed);
  const checks = await forgottenConnectors(parseConfig({ integrations: {} }), paths);
  assert.equal(checks.length, 1);
  assert.equal(checks[0]?.name, "connectors");
  assert.equal(checks[0]?.status, "warn");
  assert.match(checks[0]?.detail ?? "", /calendar/);
  assert.match(checks[0]?.detail ?? "", /"connectors": \{\}/);
});

test("the doctor says nothing about connectors when the integration is on", async () => {
  const paths = pathsWith(join(home, "loaded"), listed);
  assert.deepEqual(await forgottenConnectors(parseConfig({}), paths), []);
});

test("the doctor says nothing about connectors when none are listed", async () => {
  assert.deepEqual(
    await forgottenConnectors(parseConfig({ integrations: {} }), pathsWith(join(home, "none"))),
    [],
  );
  assert.deepEqual(
    await forgottenConnectors(parseConfig({ integrations: {} }), pathsWith(join(home, "empty"), "[]\n")),
    [],
  );
});
