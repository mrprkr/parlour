import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { resolvePaths } from "./paths.ts";
import { loadSecrets, parseEnvFile, writeSecret } from "./secrets.ts";

let home = "";
let paths = resolvePaths({ HOME: "/nowhere" }, "darwin");

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "parlour-"));
  paths = resolvePaths({ HOME: "/nowhere", PARLOUR_HOME: home }, "darwin");
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

test("parseEnvFile handles comments, quotes and blanks", () => {
  assert.deepEqual(parseEnvFile("# c\nA=1\nB=\"two words\"\n\nC='x'\n"), { A: "1", B: "two words", C: "x" });
});

test("parseEnvFile drops a comment after a quoted value", () => {
  assert.deepEqual(parseEnvFile('A="two words" # c\nB=\'x\' # c\nC="a # b"\n'), {
    A: "two words",
    B: "x",
    C: "a # b",
  });
});

test("parseEnvFile tolerates export, spaces around = and a missing value", () => {
  assert.deepEqual(parseEnvFile("export A = 1\nB=\nnot a pair\n"), { A: "1", B: "" });
});

test("env overrides file, and AGENT_TOKEN is the fallback for PARLOUR_TOKEN", () => {
  writeFileSync(paths.secretsFile, "HA_TOKEN=file\nAGENT_TOKEN=old\n");
  const s = loadSecrets(paths, { HA_TOKEN: "env" });
  assert.equal(s.haToken, "env");
  assert.equal(s.token, "old");
  assert.equal(loadSecrets(paths, { PARLOUR_TOKEN: "new" }).token, "new");
});

test("loadSecrets without a file reads only the environment", () => {
  const s = loadSecrets(paths, { ANTHROPIC_API_KEY: "k", BRAVE_API_KEY: "b", LOG_LEVEL: "debug" });
  assert.equal(s.anthropicKey, "k");
  assert.equal(s.braveKey, "b");
  assert.equal(s.logLevel, "debug");
  assert.equal(s.haToken, undefined);
  assert.equal(s.token, undefined);
});

test("writeSecret keeps other lines and sets mode 600", () => {
  writeFileSync(paths.secretsFile, "# keep\nA=1\n");
  writeSecret(paths, "B", "2");
  writeSecret(paths, "A", null);
  assert.equal(readFileSync(paths.secretsFile, "utf8"), "# keep\nB=2\n");
  assert.equal(statSync(paths.secretsFile).mode & 0o777, 0o600);
});

test("writeSecret replaces an existing key in place and creates the file when missing", () => {
  assert.equal(existsSync(paths.secretsFile), false);
  writeSecret(paths, "A", "1");
  writeSecret(paths, "B", "2");
  writeSecret(paths, "A", "one");
  assert.equal(readFileSync(paths.secretsFile, "utf8"), "A=one\nB=2\n");
});

test("writeSecret quotes values that would not survive a plain line", () => {
  writeSecret(paths, "A", "two words # not a comment");
  assert.equal(parseEnvFile(readFileSync(paths.secretsFile, "utf8")).A, "two words # not a comment");
});

test("writeSecret refuses a key that is not a legal environment name", () => {
  writeFileSync(paths.secretsFile, "A=1\n");
  assert.throws(() => writeSecret(paths, "A.*", "x"), /not a valid secret name/);
  assert.throws(() => writeSecret(paths, "1A", "x"), /not a valid secret name/);
  assert.equal(readFileSync(paths.secretsFile, "utf8"), "A=1\n");
});
