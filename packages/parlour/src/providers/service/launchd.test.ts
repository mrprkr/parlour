import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceSpec } from "../../core/ports.ts";
import { LaunchdSchema, launchd, renderPlist } from "./launchd.ts";

const spec: ServiceSpec = {
  label: "io.parlour.agent",
  what: "the agent",
  program: ["/opt/homebrew/bin/parlour", "start"],
  env: { PATH: "/opt/homebrew/bin:/usr/bin", PARLOUR_HOME: "/Users/x/.config/parlour" },
  logPath: "/Users/x/Library/Logs/parlour/agent.log",
};

test("the plist keeps the agent alive after a crash but not after a clean exit", () => {
  const xml = renderPlist(spec);
  assert.match(xml, /<key>Label<\/key><string>io\.parlour\.agent<\/string>/);
  assert.match(xml, /<string>\/opt\/homebrew\/bin\/parlour<\/string>\n\s*<string>start<\/string>/);
  assert.match(xml, /<key>PARLOUR_HOME<\/key><string>\/Users\/x\/\.config\/parlour<\/string>/);
  assert.match(xml, /<key>SuccessfulExit<\/key><false\/>/);
  assert.match(xml, /<key>Crashed<\/key><true\/>/);
  assert.match(xml, /<key>ThrottleInterval<\/key><integer>10<\/integer>/);
  assert.match(xml, /<key>ProcessType<\/key><string>Interactive<\/string>/);
  assert.match(
    xml,
    /<key>StandardOutPath<\/key><string>\/Users\/x\/Library\/Logs\/parlour\/agent\.log<\/string>/,
  );
  assert.match(
    xml,
    /<key>StandardErrorPath<\/key><string>\/Users\/x\/Library\/Logs\/parlour\/agent\.log<\/string>/,
  );
});

test("the plist escapes what XML would otherwise read as markup", () => {
  const xml = renderPlist({ ...spec, program: ["/tmp/a&b", "--name=<x>"], env: { A: "1 & 2" } });
  assert.match(xml, /<string>\/tmp\/a&amp;b<\/string>/);
  assert.match(xml, /<string>--name=&lt;x&gt;<\/string>/);
  assert.match(xml, /<key>A<\/key><string>1 &amp; 2<\/string>/);
  assert.doesNotMatch(xml, /<x>/);
});

test("the provider is registered as service/launchd with a LaunchAgents directory default", () => {
  assert.equal(launchd.kind, "service");
  assert.equal(launchd.name, "launchd");
  assert.match(LaunchdSchema.parse({}).launchAgentsDir, /Library\/LaunchAgents$/);
  assert.equal(LaunchdSchema.parse({ launchAgentsDir: "/tmp/la" }).launchAgentsDir, "/tmp/la");
});
