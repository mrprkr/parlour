import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { emit } from "../core/events.ts";
import type { Paths } from "../core/paths.ts";
import { loadPlugins } from "../core/plugins.ts";
import { loadSkills, withSkills } from "../core/skills.ts";
import { type Command, parseCli, subcommand, UsageError } from "./args.ts";
import { dim, printJson, table } from "./output.ts";

const USAGE = [
  "parlour skills list [--json]                    the house rules, and where each came from",
  "parlour skills show <name>                      print one as the model reads it",
  "parlour skills new <name> [--description <d>]   write a skeleton to edit",
  "parlour skills path                             the directory they live in",
];

const SUBCOMMANDS = ["list", "show", "new", "path"] as const;

/**
 * Skills are files, so there is no `remove`: delete the file. What the CLI
 * is for is seeing what the model will see, since a skill that is in the
 * directory but has no description, or is shadowed by a plugin's copy, is
 * invisible until something does not happen.
 */
export const command: Command = {
  name: "skills",
  summary: "House rules the model reads: list, show, and start a new one.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, {
      json: { type: "boolean" },
      description: { type: "string" },
    });
    const sub = subcommand(positionals, SUBCOMMANDS, USAGE);
    const dir = skillsDir(paths);

    switch (sub) {
      case "path":
        process.stdout.write(`${dir}\n`);
        return;

      case "list": {
        const { skills, problems } = await everySkill(paths);
        if (values.json) {
          printJson({
            skills: skills.map(({ name, description, source }) => ({ name, description, source })),
            problems,
          });
          return;
        }
        if (!skills.length && !problems.length) {
          process.stdout.write(`No skills in ${dir}. Start one with parlour skills new <name>.\n`);
          return;
        }
        if (skills.length) {
          process.stdout.write(`${table(skills.map((skill) => [skill.name, skill.description]))}\n`);
        }
        for (const problem of problems) {
          process.stderr.write(`${dim(problem.source)}: ${problem.detail}\n`);
        }
        return;
      }

      case "show": {
        const name = positionals[1];
        if (!name) throw new UsageError(`Usage:\n  ${USAGE[1]}`);
        const { skills } = await everySkill(paths);
        const skill = skills.find((candidate) => candidate.name === name.toLowerCase());
        if (!skill) throw new Error(`No skill called ${name}. Run parlour skills list.`);
        process.stdout.write(`${skill.body}\n`);
        return;
      }

      case "new": {
        const name = positionals[1];
        if (!name) throw new UsageError(`Usage:\n  ${USAGE[2]}`);
        const file = join(dir, `${name}.md`);
        if (existsSync(file)) throw new Error(`${file} already exists.`);
        mkdirSync(dir, { recursive: true });
        const description =
          typeof values.description === "string" ? values.description : `When to ${name}, and what to do`;
        writeFileSync(file, skeleton(name, description));
        process.stdout.write(`${file}\n`);
        return;
      }
    }
  },
};

function skillsDir(paths: Paths): string {
  return loadConfig(paths).config.skills.dir || paths.skillsDir;
}

/**
 * The directory plus whatever the plugins bring, which is the list the agent
 * would build. The plugins are loaded but not set up: this command is asking
 * what they contain, not running them.
 */
async function everySkill(paths: Paths) {
  const { config } = loadConfig(paths);
  const plugins = await loadPlugins(config.plugins, { paths, emit, config }, { setup: false });
  const dir = config.skills.dir || paths.skillsDir;
  return withSkills(loadSkills([dir, ...plugins.skillDirs]), plugins.skills);
}

/** Frontmatter and a heading, so the first edit is the rule itself. */
function skeleton(name: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    `Write what the house should do when this applies. It is read out of`,
    "context, so say which tools to call and in what order, and keep the",
    "spoken reply to a sentence.",
    "",
  ].join("\n");
}
