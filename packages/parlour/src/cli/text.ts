import { createInterface } from "node:readline/promises";
import { buildAgent } from "../core/agent.ts";
import { loadConfig } from "../core/config.ts";
import { loadSecrets } from "../core/secrets.ts";
import { type Command, parseCli } from "./args.ts";

const USAGE = ["parlour text   type to it; /reset forgets the conversation, /quit leaves"];

/**
 * Everything but the microphone, for trying it over SSH or without a
 * speaker. The same agent, the same tools, the same router; only the frames
 * are missing, so a reply that is wrong here is wrong out loud too.
 */
export const command: Command = {
  name: "text",
  summary: "Talk to it in the terminal, without the microphone.",
  usage: USAGE,

  async run({ paths, argv }) {
    parseCli(argv);
    const { config } = loadConfig(paths);
    const agent = await buildAgent(config, loadSecrets(paths), paths, { audio: false });

    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
    rl.prompt();
    try {
      // The iterator ends on Ctrl-D, which a question() loop would not notice.
      for await (const raw of rl) {
        const line = raw.trim();
        if (line === "/quit") break;
        if (line === "/reset") agent.router.reset();
        else if (line) {
          const answer = await agent.router.ask(line, { session: "terminal" });
          process.stdout.write(`${answer.text}\n`);
        }
        rl.prompt();
      }
    } finally {
      rl.close();
      await agent.close();
    }
  },
};
