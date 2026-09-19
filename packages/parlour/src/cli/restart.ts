import { pickServiceManager } from "../providers/service/index.ts";
import { type Command, parseCli } from "./args.ts";
import { everyService, print } from "./service.ts";

const USAGE = ["parlour restart   stop and start the agent, and whatever it keeps warm"];

/**
 * What to run after editing `config.json` or a secret: the agent reads both
 * once, at start-up, so a change to either is not in force until it has been
 * round-tripped. Anything the config no longer wants is stopped rather than
 * restarted, so a box that became a satellite does not bring its old whisper
 * server back up.
 */
export const command: Command = {
  name: "restart",
  summary: "Restart the agent and everything Parlour keeps running.",
  usage: USAGE,

  async run({ paths, argv }) {
    parseCli(argv);
    const { specs, all } = await everyService(paths);
    const manager = pickServiceManager();
    const leftovers = all.filter((service) => !specs.some((spec) => spec.label === service.label));
    const stopped = (await manager.stop(leftovers)).filter((state) => state.installed);
    const states = await manager.restart(specs);
    if (!states.some((state) => state.installed)) {
      process.stdout.write(
        "Nothing is installed to restart. parlour service install, or let the menu bar app own it.\n",
      );
      return;
    }
    print([...states.filter((state) => state.installed), ...stopped]);
  },
};
