import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { loadConfig, parseConfig, writeConfig } from "../core/config.ts";
import { type Command, parseCli, readStdin, subcommand, UsageError } from "./args.ts";
import { printJson } from "./output.ts";

const USAGE = [
  "parlour config path              where the config file is",
  "parlour config show [--json]     the effective config, defaults filled in",
  "parlour config write             replace the file with the JSON on stdin, after validating it",
  "parlour config edit              open it in $EDITOR",
];

const SUBCOMMANDS = ["path", "show", "write", "edit"] as const;

/**
 * The config file, from the outside. `show` and `write` are how the desktop
 * app reads and saves settings, so `show` fills in every default (the app has
 * no schema of its own) and `write` refuses anything the schema would.
 */
export const command: Command = {
  name: "config",
  summary: "The config file: where it is, what it says, and changing it.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, { json: { type: "boolean" } });
    const sub = subcommand(positionals, SUBCOMMANDS, USAGE);

    switch (sub) {
      case "path":
        process.stdout.write(`${paths.configFile}\n`);
        return;

      case "show": {
        const { config } = loadConfig(paths);
        if (values.json) printJson(config);
        else process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
        return;
      }

      case "write": {
        const text = await readStdin();
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch (error) {
          throw new UsageError(`stdin is not valid JSON: ${(error as Error).message}`);
        }
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
          throw new UsageError("stdin must contain a JSON object");
        }
        // Validated before anything is written, so a bad document cannot
        // replace a good file. What is written is the document as given, not
        // the parsed one, so defaults are not frozen into the file.
        parseConfig(raw);
        writeConfig(paths, raw as Record<string, unknown>);
        return;
      }

      case "edit": {
        if (!existsSync(paths.configFile)) writeConfig(paths, {});
        const editor = process.env.VISUAL || process.env.EDITOR || "vi";
        await new Promise<void>((resolve, reject) => {
          // Through a shell, because $EDITOR is allowed to be "code --wait".
          // The path rides in as $0 rather than in the string, so it needs no quoting.
          const child = spawn("sh", ["-c", `${editor} "$0"`, paths.configFile], { stdio: "inherit" });
          child.on("error", reject);
          child.on("close", (code) =>
            code === 0 ? resolve() : reject(new Error(`${editor} exited ${code}`)),
          );
        });
        // Read back so a stray comma is reported now, not at the next start.
        loadConfig(paths);
        return;
      }
    }
  },
};
