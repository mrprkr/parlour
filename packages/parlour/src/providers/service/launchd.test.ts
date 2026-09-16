import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ServiceSpec } from "../../core/ports.ts";
import { createLaunchd, LaunchdSchema, launchd, renderPlist } from "./launchd.ts";

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
  assert.equal(LaunchdSchema.parse({}).launchctl, "launchctl");
  assert.equal(LaunchdSchema.parse({ launchctl: "/tmp/fake" }).launchctl, "/tmp/fake");
});

test("install, status and uninstall go through the launchctl they were given", async () => {
  // A stub in place of launchctl, so this can run on any Mac (and on CI)
  // without loading a job into the launchd of whoever is running the tests.
  // It records its arguments and reports one job as running.
  const dir = mkdtempSync(join(tmpdir(), "parlour-launchd-"));
  try {
    const log = join(dir, "calls.log");
    const stub = join(dir, "launchctl");
    writeFileSync(
      stub,
      [
        "#!/bin/sh",
        `printf '%s\\n' "$*" >> "${log}"`,
        'if [ "$1" = list ]; then',
        '  [ "$2" = io.parlour.agent ] && { echo \'{ "PID" = 4242; "LastExitStatus" = 0; };\'; exit 0; }',
        "  exit 113",
        "fi",
        "exit 0",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    const manager = createLaunchd({ launchAgentsDir: join(dir, "LaunchAgents"), launchctl: stub });
    const local = { ...spec, logPath: join(dir, "logs", "agent.log") };
    const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean);

    const [installed] = await manager.install([local]);
    assert.ok(existsSync(join(dir, "LaunchAgents", "io.parlour.agent.plist")), "the plist was written");
    assert.equal(installed?.installed, true);
    assert.equal(installed?.running, true);
    assert.equal(installed?.pid, 4242);
    assert.ok(
      calls().some((call) => call.startsWith("bootstrap gui/")),
      `loaded through the stub: ${calls().join("; ")}`,
    );

    const [status] = await manager.status([{ ...local, label: "io.parlour.whisper" }]);
    assert.equal(status?.installed, false, "no plist for whisper");
    assert.equal(status?.running, false, "the stub knows no such job");

    assert.deepEqual(await manager.uninstall(["io.parlour.agent"]), ["io.parlour.agent"]);
    assert.equal(existsSync(join(dir, "LaunchAgents", "io.parlour.agent.plist")), false);
    assert.ok(
      calls().some((call) => call.startsWith("bootout gui/")),
      `unloaded through the stub: ${calls().join("; ")}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
