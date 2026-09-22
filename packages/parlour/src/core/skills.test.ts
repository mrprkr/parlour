import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  loadSkills,
  parseSkill,
  READ_SKILL_TOOL,
  skillChecks,
  skillPromptContext,
  skillTools,
  withSkills,
} from "./skills.ts";

const root = mkdtempSync(join(tmpdir(), "parlour-skills-"));
after(() => rmSync(root, { recursive: true, force: true }));

/** A directory of skill files, written fresh for one test. */
function skills(files: Record<string, string>): string {
  const dir = mkdtempSync(join(root, "dir-"));
  for (const [name, text] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  }
  return dir;
}

const bedtime = ["---", "name: bedtime", "description: What goodnight means", "---", "Porch light on."].join(
  "\n",
);

test("a skill is frontmatter over a body, and the filename names it when the frontmatter does not", () => {
  const parsed = parseSkill(bedtime, "/house/skills/anything.md");
  assert.deepEqual(parsed, {
    name: "bedtime",
    description: "What goodnight means",
    body: "Porch light on.",
    source: "/house/skills/anything.md",
  });

  const bare = parseSkill("Turn the kettle on.", "/house/skills/tea.md");
  assert.equal("name" in bare && bare.name, "tea");
  // Without a description the first line is the one thing the author wrote.
  assert.equal("description" in bare && bare.description, "Turn the kettle on.");
});

test("frontmatter still accepts spaces around the colon", () => {
  const parsed = parseSkill(
    "---\nname : bedtime\ndescription : What goodnight means\n---\nPorch light on.",
    "/x.md",
  );
  assert.equal("name" in parsed && parsed.name, "bedtime");
  assert.equal("description" in parsed && parsed.description, "What goodnight means");
});

test("a name the prompt and the tool schema could not carry is a problem, not a skill", () => {
  const spaced = parseSkill("---\nname: bed time\n---\nbody", "/x.md");
  assert.match("detail" in spaced ? spaced.detail : "", /not a usable skill name/);
  const empty = parseSkill("---\nname: bedtime\ndescription: d\n---\n", "/x.md");
  assert.match("detail" in empty ? empty.detail : "", /nothing under its frontmatter/);
});

test("both layouts load, and a directory needs its SKILL.md", () => {
  const dir = skills({
    "bedtime.md": bedtime,
    "shopping/SKILL.md": "---\ndescription: The list\n---\nRead the list.",
    "notes/README.md": "not a skill",
    ".hidden.md": "---\nname: hidden\n---\nno",
    "notes.txt": "not markdown",
  });
  const { skills: loaded, problems } = loadSkills([dir]);
  assert.deepEqual(
    loaded.map((skill) => skill.name),
    ["bedtime", "shopping"],
  );
  assert.equal(problems.length, 0);
});

test("the first directory wins, so a house rule replaces a plugin's copy of the same name", () => {
  const house = skills({ "bedtime.md": bedtime });
  const plugin = skills({ "bedtime.md": "---\nname: bedtime\ndescription: theirs\n---\nTheirs." });
  const { skills: loaded, problems } = loadSkills([house, plugin]);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.body, "Porch light on.");
  assert.match(problems[0]?.detail ?? "", /already defined/);

  // Skills a plugin declares in code are added the same way, and lose the same way.
  const merged = withSkills(loadSkills([house]), [
    { name: "bedtime", description: "theirs", body: "Theirs.", source: "plugin" },
    { name: "car", description: "Charging", body: "Plug it in.", source: "plugin" },
  ]);
  assert.deepEqual(
    merged.skills.map((skill) => skill.name),
    ["bedtime", "car"],
  );
  assert.equal(merged.skills[0]?.body, "Porch light on.");
});

test("a missing directory is no skills rather than a failure", () => {
  assert.deepEqual(loadSkills([join(root, "nothing-here")]), { skills: [], problems: [] });
});

test("the prompt carries the names and the tool carries the bodies", async () => {
  const dir = skills({ "bedtime.md": bedtime });
  const { skills: loaded } = loadSkills([dir]);

  const lines = skillPromptContext(loaded);
  assert.match(lines[0] as string, new RegExp(READ_SKILL_TOOL));
  assert.equal(lines[1], "- bedtime: What goodnight means");
  // The body is the one thing that is not in the prompt: it is fetched.
  assert.ok(!lines.join("\n").includes("Porch light on."));

  const [tool] = skillTools(loaded);
  assert.equal(tool?.name, READ_SKILL_TOOL);
  const name = tool?.inputSchema.properties?.name as { enum: string[] } | undefined;
  assert.deepEqual(name?.enum, ["bedtime"]);
  assert.equal(await tool?.run({ name: "bedtime" }), "Porch light on.");
  // A name the model invented comes back as the list, not as an error.
  assert.match((await tool?.run({ name: "nope" })) ?? "", /No skill called nope/);
});

test("no skills means no tool and no prompt lines at all", () => {
  assert.deepEqual(skillTools([]), []);
  assert.deepEqual(skillPromptContext([]), []);
});

test("the doctor counts them, names the broken file and warns about a long one", () => {
  const dir = skills({
    "bedtime.md": bedtime,
    "broken.md": "---\nname: not a name\n---\nbody",
    "long.md": `---\nname: long\ndescription: d\n---\n${"x".repeat(5000)}`,
  });
  const checks = skillChecks(dir, loadSkills([dir]));
  assert.equal(checks[0]?.status, "ok");
  assert.match(checks[0]?.detail ?? "", /2 in /);
  assert.equal(checks.filter((check) => check.status === "warn").length, 2);

  // An empty directory is not something to fix, so the doctor says nothing.
  assert.deepEqual(skillChecks(dir, { skills: [], problems: [] }), []);
});
