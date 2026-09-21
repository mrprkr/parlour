import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { Check } from "./ports.ts";
import { defineTool, type Tool } from "./registry.ts";

/**
 * A skill is a markdown file the house reads to itself. The house knows how
 * to call tools; it does not know that "goodnight" means the porch light
 * stays on and the rest go off. That is a house rule, it changes every time
 * someone rearranges a room, and writing it in markdown is quicker than
 * writing a provider.
 *
 * Only the name and the description are in the prompt. The body is fetched
 * by the model with `read_skill` when it decides the skill applies, because
 * a local model with a 4k window cannot carry every house rule on every turn
 * and most turns are "turn the kitchen light off".
 */
export interface Skill {
  name: string;
  description: string;
  /** The markdown under the frontmatter, which is what the model is given. */
  body: string;
  /** The file it was read from, for the doctor and for `parlour skills list`. */
  source: string;
}

/** A skill file that could not be used, with the reason a person can act on. */
export interface SkillProblem {
  source: string;
  detail: string;
}

export const READ_SKILL_TOOL = "read_skill";

/** Names go in a tool schema and in the prompt, so keep them plain. */
const NAME = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Long enough that the answer is slow and the small model loses the thread.
 * A warning rather than a refusal: it is the author's house.
 */
const LONG_BODY = 4000;

/**
 * Both layouts are allowed: `<name>.md` for a rule that is a paragraph, and
 * `<name>/SKILL.md` for one that comes with files of its own (a shopping
 * list, a script the body tells the model to mention).
 */
export function skillFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      const nested = join(path, "SKILL.md");
      if (existsSync(nested)) files.push(nested);
      continue;
    }
    if (extname(entry) === ".md") files.push(path);
  }
  return files;
}

/**
 * Frontmatter, by hand. The keys are `name` and `description`, both one line
 * of plain text, so a YAML parser would be a dependency and a surface for
 * three lines of parsing. Anything else in the block is ignored rather than
 * refused, so a skill written for another tool still loads here.
 */
export function parseSkill(text: string, source: string): Skill | SkillProblem {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  const fields: Record<string, string> = {};
  if (match) {
    for (const line of (match[1] as string).split(/\r?\n/)) {
      const pair = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
      if (pair) fields[(pair[1] as string).toLowerCase()] = unquote((pair[2] as string).trim());
    }
  }
  const body = (match ? text.slice(match[0].length) : text).trim();

  // The filename is the name unless the frontmatter says otherwise, so a
  // one-paragraph skill needs no frontmatter at all.
  const fallback =
    basename(source, ".md") === "SKILL" ? basename(join(source, "..")) : basename(source, ".md");
  const name = (fields.name ?? fallback).trim().toLowerCase();
  if (!NAME.test(name)) {
    return { source, detail: `"${name}" is not a usable skill name: lower case letters, digits, - and _` };
  }
  if (!body) return { source, detail: `${name} has nothing under its frontmatter` };
  // Without a description the model has nothing to choose on, and the first
  // line of the body is what the author would have written anyway.
  const description = fields.description?.trim() || (body.split("\n")[0] as string).trim();
  return { name, description, body, source };
}

export interface LoadedSkills {
  skills: Skill[];
  problems: SkillProblem[];
}

/**
 * Every skill in the given directories, first one wins on a clash: the house
 * comes before the plugins, so a rule written here can replace one a plugin
 * shipped without editing the plugin.
 */
export function loadSkills(dirs: string[]): LoadedSkills {
  const skills: Skill[] = [];
  const problems: SkillProblem[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    for (const source of skillFiles(dir)) {
      let text: string;
      try {
        text = readFileSync(source, "utf8");
      } catch (error) {
        problems.push({ source, detail: (error as Error).message });
        continue;
      }
      const parsed = parseSkill(text, source);
      if (!("name" in parsed)) {
        problems.push(parsed);
        continue;
      }
      if (seen.has(parsed.name)) {
        problems.push({ source, detail: `${parsed.name} is already defined, so this copy is ignored` });
        continue;
      }
      seen.add(parsed.name);
      skills.push(parsed);
    }
  }

  return { skills, problems };
}

/**
 * Skills a plugin declared in code, added to what was read from disk. A
 * name already taken by a file is left alone: the house's own directory is
 * read first, and a rule written there is meant to win.
 */
export function withSkills(loaded: LoadedSkills, extra: Skill[]): LoadedSkills {
  const skills = [...loaded.skills];
  const problems = [...loaded.problems];
  for (const skill of extra) {
    if (skills.some((existing) => existing.name === skill.name)) {
      problems.push({
        source: skill.source,
        detail: `${skill.name} is already defined, so this copy is ignored`,
      });
      continue;
    }
    skills.push(skill);
  }
  return { skills, problems };
}

/**
 * The lines the model sees every turn. Deliberately short: a name, a
 * sentence, and the one instruction that matters, which is to read the skill
 * before acting rather than to guess at what it says.
 */
export function skillPromptContext(skills: Skill[]): string[] {
  if (!skills.length) return [];
  return [
    `House rules you can read with ${READ_SKILL_TOOL} before you act, when one of them fits what was asked:`,
    ...skills.map((skill) => `- ${skill.name}: ${skill.description}`),
  ];
}

/** One tool, whatever the number of skills, so the tool list stays short. */
export function skillTools(skills: Skill[]): Tool[] {
  if (!skills.length) return [];
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  return [
    defineTool(
      READ_SKILL_TOOL,
      `Read a house rule in full before acting on it. Available: ${[...byName.keys()].join(", ")}.`,
      {
        type: "object",
        properties: { name: { type: "string", enum: [...byName.keys()], description: "Which rule" } },
        required: ["name"],
      },
      async (args) => {
        const skill = byName.get(String(args.name ?? "").toLowerCase());
        // A wrong name is information for the model, not a failure: it can
        // pick again from the list without a round trip through the person.
        if (!skill) return `No skill called ${args.name}. There is: ${[...byName.keys()].join(", ")}.`;
        return skill.body;
      },
    ),
  ];
}

/** What `parlour doctor` says about the skills directory. */
export function skillChecks(dir: string, { skills, problems }: LoadedSkills): Check[] {
  const checks: Check[] = problems.map((problem) => ({
    name: "skills",
    status: "warn" as const,
    detail: `${problem.source}: ${problem.detail}`,
  }));
  for (const skill of skills.filter((skill) => skill.body.length > LONG_BODY)) {
    checks.push({
      name: "skills",
      status: "warn",
      detail: `${skill.name} is ${skill.body.length} characters, which is a lot for the local model to read in one go`,
    });
  }
  // A house with no skills gets no line: the doctor is a list of things to
  // fix, and an empty directory is not one. `parlour skills path` is there
  // for the person looking for where they go.
  if (skills.length) {
    checks.unshift({ name: "skills", status: "ok", detail: `${skills.length} in ${dir}` });
  }
  return checks;
}

function unquote(value: string): string {
  const quoted = /^"(.*)"$|^'(.*)'$/.exec(value);
  return quoted ? ((quoted[1] ?? quoted[2]) as string) : value;
}
