import { loadSecrets, readSecretsFile, type Secrets, writeSecret } from "../core/secrets.ts";
import { type Command, parseCli, readStdin, subcommand, UsageError } from "./args.ts";
import { printJson, table } from "./output.ts";

const USAGE = [
  "parlour secrets status [--json]   which secrets are set (never their values)",
  "parlour secrets set <NAME>        read the value from stdin; an empty value removes it",
];

const SUBCOMMANDS = ["status", "set"] as const;

/** The names `status` reports on, and what each one is for. */
const KNOWN: { name: string; key: keyof Secrets; what: string }[] = [
  { name: "HA_TOKEN", key: "haToken", what: "Home Assistant" },
  { name: "ANTHROPIC_API_KEY", key: "anthropicKey", what: "cloud escalation" },
  { name: "PARLOUR_TOKEN", key: "token", what: "the network" },
  { name: "BRAVE_API_KEY", key: "braveKey", what: "Brave search" },
];

/**
 * `secrets.env` without ever showing what is in it. The value for `set`
 * arrives on stdin rather than as an argument so it never lands in a shell
 * history or a process listing, which is also how the desktop app passes it.
 */
export const command: Command = {
  name: "secrets",
  summary: "Which secrets are set, and setting one.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, { json: { type: "boolean" } });
    const sub = subcommand(positionals, SUBCOMMANDS, USAGE);

    if (sub === "status") {
      // The environment counts, as it does for the running agent.
      const secrets = loadSecrets(paths);
      const present = Object.fromEntries(KNOWN.map(({ name, key }) => [name, Boolean(secrets[key])]));
      // Anything else in the file is a provider's own key, set by name and
      // read from the environment, so it is reported too rather than being
      // the one secret this command cannot see.
      const file = readSecretsFile(paths);
      const others = Object.keys(file).filter((name) => !KNOWN.some((known) => known.name === name));
      for (const name of others) present[name] = Boolean(process.env[name] ?? file[name]);
      if (values.json) {
        printJson(present);
        return;
      }
      const rows = KNOWN.map(({ name, what }) => [present[name] ? "set" : "unset", name, what]);
      for (const name of others) rows.push([present[name] ? "set" : "unset", name, "in secrets.env"]);
      process.stdout.write(`${table(rows)}\n\n${paths.secretsFile}\n`);
      return;
    }

    const name = positionals[1];
    if (!name) throw new UsageError(`Which one? Usage:\n  ${USAGE[1]}`);
    const value = (await readStdin()).trim();
    // writeSecret refuses a name that is not a plain environment name.
    writeSecret(paths, name, value || null);
  },
};
