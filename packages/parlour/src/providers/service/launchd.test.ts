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

/**
 * A launchctl that keeps its jobs as files in `dir`, and, like the real one,
 * takes a while to let go of a job after `bootout`: for the next `drain`
 * calls to `list` the job is still there, and `bootstrap` fails with launchd's
 * error 5 while `load` fails but exits 0.
 */
function fakeLaunchctl(dir: string, log: string, drain = 0): string {
  const stub = join(dir, "launchctl");
  writeFileSync(
    stub,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> "${log}"`,
      'for last; do :; done; label=$(basename "$last" .plist)',
      `job="${dir}/job-$label"; draining="${dir}/draining-$label"`,
      'case "$1" in',
      "  list)",
      '    if [ -s "$draining" ]; then n=$(cat "$draining"); echo $((n - 1)) > "$draining";',
      '      [ "$n" -le 1 ] && rm -f "$draining" "$job"; exit 0; fi',
      '    [ -f "$job" ] && { echo \'{ "PID" = 4242; "LastExitStatus" = 0; };\'; exit 0; }',
      "    exit 113 ;;",
      '  bootstrap) [ -s "$draining" ] && exit 5; touch "$job" ;;',
      '  load) [ -s "$draining" ] || touch "$job" ;;',
      `  bootout|unload) [ -f "$job" ] && { [ ${drain} -gt 0 ] && echo ${drain} > "$draining" || rm -f "$job"; } ;;`,
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return stub;
}

test("install, status and uninstall go through the launchctl they were given", async () => {
  // A stub in place of launchctl, so this can run on any Mac (and on CI)
  // without loading a job into the launchd of whoever is running the tests.
  // It records its arguments and remembers which jobs it has loaded.
  const dir = mkdtempSync(join(tmpdir(), "parlour-launchd-"));
  try {
    const log = join(dir, "calls.log");
    const stub = fakeLaunchctl(dir, log);
    const manager = createLaunchd(
      LaunchdSchema.parse({ launchAgentsDir: join(dir, "LaunchAgents"), launchctl: stub }),
    );
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

    // Stopping boots the job out and leaves the plist, so launchd starts it
    // again at the next login. That is the difference between "stop it" and
    // "get rid of it", and uninstall is the other one.
    const outs = () => calls().filter((call) => call.startsWith("bootout gui/")).length;
    const before = outs();
    const [stopped] = await manager.stop([local]);
    assert.equal(outs(), before + 1, `booted out through the stub: ${calls().join("; ")}`);
    assert.ok(existsSync(join(dir, "LaunchAgents", "io.parlour.agent.plist")), "the plist is still there");
    assert.equal(stopped?.installed, true);

    // Nothing to stop is not an error, and nothing is asked of launchctl.
    const quiet = outs();
    await manager.stop([{ ...local, label: "io.parlour.whisper" }]);
    assert.equal(outs(), quiet, "no job, nothing booted out");

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

test("reinstalling a running job waits for launchd to let go before loading it again", async () => {
  // The local model takes a moment to exit after bootout, and a bootstrap in
  // that moment fails. Install used to lose that race and leave the job
  // unloaded, reporting nothing.
  const dir = mkdtempSync(join(tmpdir(), "parlour-launchd-"));
  try {
    const log = join(dir, "calls.log");
    const manager = createLaunchd(
      LaunchdSchema.parse({
        launchAgentsDir: join(dir, "LaunchAgents"),
        launchctl: fakeLaunchctl(dir, log, 3),
      }),
    );
    const local = { ...spec, label: "io.parlour.llm", logPath: join(dir, "logs", "llm.log") };

    const [first] = await manager.install([local]);
    assert.equal(first?.running, true, "installed from nothing");

    const [again] = await manager.install([local]);
    assert.equal(again?.running, true, "still loaded after the reinstall");
    const [restarted] = await manager.restart([local]);
    assert.equal(restarted?.running, true, "and after a restart");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
