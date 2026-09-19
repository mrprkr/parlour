import { pickServiceManager } from "../providers/service/index.ts";
import { type Command, parseCli } from "./args.ts";
import { everyService, print } from "./service.ts";

const USAGE = ["parlour stop   stop the agent, and whatever it keeps warm, until the next login"];

/**
 * The other end of `parlour start`. What is running is what launchd was asked
 * to keep running, so this stops the jobs rather than hunting for processes:
 * killing `parlour start` by pid only has launchd start it again ten seconds
 * later, which looks from the outside like the stop not working.
 *
 * The plists are left in place, so everything comes back at the next login.
 * `parlour service uninstall` is the one that forgets.
 */
export const command: Command = {
  name: "stop",
  summary: "Stop the agent and everything Parlour keeps running.",
  usage: USAGE,

  async run({ paths, argv }) {
    parseCli(argv);
    const { all } = await everyService(paths);
    const states = await pickServiceManager().stop(all);
    if (!states.some((state) => state.installed)) {
      process.stdout.write(
        "Nothing is installed to stop. If the menu bar app is running the agent, quit the app.\n",
      );
      return;
    }
    print(states.filter((state) => state.installed));
    process.stdout.write("\nparlour restart starts it again, and so does the next login.\n");
  },
};
