import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { resolvePaths } from "./paths.ts";
import { loadPlugins, mergeIntegrations, PluginError, pluginChecks } from "./plugins.ts";
import { registeredProviders, registerProvider } from "./providers.ts";

const root = mkdtempSync(join(tmpdir(), "parlour-plugins-"));
after(() => rmSync(root, { recursive: true, force: true }));

const paths = resolvePaths({ HOME: root, PARLOUR_HOME: root });
const context = { paths, emit: () => {}, config: {} };

/** A plugin package as one ES module file, loaded by absolute path. */
function plugin(name: string, body: string): string {
  const file = join(root, `${name}.js`);
  writeFileSync(file, body);
  return file;
}

test("a plugin brings providers, skills and a directory of them", async () => {
  const file = plugin(
    "full",
    `export default {
       name: "car",
       description: "The car",
       providers: [{ kind: "tts", name: "car-voice", description: "d", create: () => ({}) }],
       skills: [{ name: "charging", description: "When to charge", body: "Plug it in.", source: "car" }],
       skillsDir: "/opt/car/skills",
       integrations: { mcp: { servers: { car: { transport: "stdio", command: "car-mcp" } } } },
     };`,
  );

  const loaded = await loadPlugins([file], context);
  assert.equal(loaded.plugins[0]?.plugin.name, "car");
  assert.deepEqual(loaded.skillDirs, ["/opt/car/skills"]);
  assert.equal(loaded.skills[0]?.name, "charging");
  // Registered before any slot is filled, so config can name it.
  assert.ok(registeredProviders("tts").some((definition) => definition.name === "car-voice"));
  assert.deepEqual(pluginChecks(loaded), [{ name: "plugins", status: "ok", detail: "car" }]);
});

test("a provider that is already registered stays, and the clash is reported", async () => {
  registerProvider({ kind: "search", name: "taken", description: "d", create: () => ({}) });
  const file = plugin(
    "clash",
    `export default {
       name: "clash",
       providers: [{ kind: "search", name: "taken", description: "theirs", create: () => ({}) }],
     };`,
  );
  const loaded = await loadPlugins([file], context);
  assert.deepEqual(loaded.clashes, ["search/taken"]);
  assert.equal(registeredProviders("search").find((d) => d.name === "taken")?.description, "d");
  assert.match(pluginChecks(loaded)[1]?.detail ?? "", /already registered/);
});

test("setup runs when the agent is built, and is held back when a plugin is only being listed", async () => {
  const marker = join(root, "setup-ran");
  const file = plugin(
    "setup",
    `import { writeFileSync } from "node:fs";
     export default {
       name: "setup",
       setup: (context) => writeFileSync(${JSON.stringify(marker)}, context.paths.home),
     };`,
  );

  await loadPlugins([file], context, { setup: false });
  assert.equal(existsSync(marker), false, "listing a plugin must not run it");

  await loadPlugins([file], context);
  assert.equal(existsSync(marker), true);
});

test("a plugin named in config that cannot be used is fatal, with the reason", async () => {
  await assert.rejects(() => loadPlugins(["../sneaky"], context), PluginError);
  await assert.rejects(() => loadPlugins(["parlour-plugin-that-is-not-installed"], context), {
    message: /is not installed/,
  });

  const wrong = plugin("wrong", "export default { hello: true };");
  await assert.rejects(() => loadPlugins([wrong], context), { message: /shaped like a plugin/ });

  // A provider is not a plugin: the shapes are close enough to be worth saying so.
  const provider = plugin("provider", 'export default { kind: "tts", name: "x", create: () => ({}) };');
  await assert.rejects(() => loadPlugins([provider], context), { message: /shaped like a plugin/ });

  const broken = plugin(
    "broken",
    'export default { name: "broken", setup: () => { throw new Error("no"); } };',
  );
  await assert.rejects(() => loadPlugins([broken], context), { message: /could not set itself up: no/ });
});

test("a plugin's integrations go underneath the house's own, never over them", () => {
  const plugins = [
    {
      plugin: {
        name: "car",
        integrations: {
          mcp: { servers: { car: { transport: "stdio", command: "car-mcp" } } },
          "car-tools": { region: "eu" },
        },
      },
    },
  ];

  const merged = mergeIntegrations(
    { "home-assistant": {}, mcp: { servers: { weather: { transport: "http", url: "http://w" } } } },
    plugins,
  );
  // Both servers, and the house's own integrations left alone.
  assert.deepEqual(Object.keys(merged), ["home-assistant", "mcp", "car-tools"]);
  assert.deepEqual(Object.keys((merged.mcp as { servers: object }).servers), ["car", "weather"]);

  // What the person wrote wins on a clash, down through the nesting.
  const overridden = mergeIntegrations(
    { mcp: { servers: { car: { transport: "stdio", command: "mine" } } } },
    plugins,
  );
  const servers = (overridden.mcp as { servers: Record<string, { command: string }> }).servers;
  assert.equal(servers.car?.command, "mine");
});
