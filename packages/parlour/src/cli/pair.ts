import { hostname } from "node:os";
import qrcode from "qrcode-generator";
import { loadConfig } from "../core/config.ts";
import { loadSecrets } from "../core/secrets.ts";
import { type Command, parseCli } from "./args.ts";
import { dim, headline, printJson } from "./output.ts";

const USAGE = [
  "parlour pair                 a code for the iPhone app to scan: this server's address and token",
  "parlour pair --host <name>   the address to put in it, when this Mac's own name does not reach it",
  "parlour pair --json          the link and the code as SVG, for the desktop app",
];

/**
 * Pairing a phone without typing a 48 character token on it. The code holds
 * one link, `parlour://pair?url=...&token=...&name=...`, which the iPhone
 * app reads from its own scanner and which also opens the app when the
 * Camera finds it. Nothing is sent anywhere: the code is drawn here, and
 * whoever can see it can let a phone into the house, which is what it says.
 */

export interface Pairing {
  /** Where the phone should talk to, as it would type it. */
  url: string;
  token: string;
  /** What the phone calls this server, the same name Bonjour advertises. */
  name: string;
}

export const PAIR_SCHEME = "parlour";

/**
 * Percent-encoded throughout rather than through URLSearchParams, which
 * writes a space as "+": Foundation's URLComponents on the phone reads a "+"
 * as a plus, and a server called "Parlour on den" would arrive as
 * "Parlour+on+den".
 */
export function pairingLink(pairing: Pairing): string {
  const query = (["url", "token", "name"] as const)
    .map((key) => `${key}=${encodeURIComponent(pairing[key])}`)
    .join("&");
  return `${PAIR_SCHEME}://pair?${query}`;
}

/**
 * The name a phone on the same network can reach this Mac by. macOS answers
 * to `<name>.local` over Bonjour, and `hostname()` sometimes has the suffix
 * and sometimes does not, depending on how the Mac was named. An address or
 * a name with a domain already has a dot, and is left as it is.
 */
export function reachableHost(name: string): string {
  const bare = name.trim().replace(/\.$/, "");
  return bare.includes(".") ? bare : `${bare}.local`;
}

/** The link as a grid of modules, true for dark, with the four module quiet zone scanners want. */
export function qrModules(text: string): boolean[][] {
  // M: enough correction to survive a glare on a screen, small enough that a
  // link with a token in it stays a code a phone reads from across a desk.
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  const size = code.getModuleCount();
  const quiet = 4;
  const grid: boolean[][] = [];
  for (let row = -quiet; row < size + quiet; row++) {
    const line: boolean[] = [];
    for (let col = -quiet; col < size + quiet; col++) {
      line.push(row >= 0 && col >= 0 && row < size && col < size && code.isDark(row, col));
    }
    grid.push(line);
  }
  return grid;
}

/**
 * The grid in half blocks, two rows of modules to a line of text, so the
 * code comes out square in a terminal. Colours are set explicitly, black on
 * white, because a scanner wants dark modules on a light ground and a dark
 * terminal theme would otherwise draw it inverted.
 */
export function terminalCode(grid: boolean[][]): string {
  const lines: string[] = [];
  for (let row = 0; row < grid.length; row += 2) {
    const top = grid[row] ?? [];
    const bottom = grid[row + 1] ?? top.map(() => false);
    let text = "";
    for (let col = 0; col < top.length; col++) {
      const up = top[col];
      const down = bottom[col];
      text += up && down ? "█" : up ? "▀" : down ? "▄" : " ";
    }
    lines.push(`\x1b[30;47m${text}\x1b[0m`);
  }
  return lines.join("\n");
}

/** The code as a scalable SVG, black on white, for a window to draw at whatever size it likes. */
export function svgCode(grid: boolean[][]): string {
  const size = grid.length;
  const path = grid
    .flatMap((line, row) => line.map((dark, col) => (dark ? `M${col} ${row}h1v1h-1z` : "")))
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}

export const command: Command = {
  name: "pair",
  summary: "Show a code for the iPhone app to scan, with this server's address and token.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { values } = parseCli(argv, { json: { type: "boolean" }, host: { type: "string" } });
    const { config } = loadConfig(paths);
    const { token } = loadSecrets(paths);

    if (config.role !== "server") {
      throw new Error("This machine is a satellite. Pair the phone with the server: run parlour pair there.");
    }
    if (!config.server.enabled) {
      throw new Error(
        "The server is off (server.enabled is false), so there is nothing for a phone to reach.",
      );
    }
    if (!token) {
      throw new Error(
        "No PARLOUR_TOKEN, so the server answers this machine only and a phone cannot reach it. " +
          "parlour init makes one, or parlour secrets set PARLOUR_TOKEN.",
      );
    }

    const host = reachableHost(typeof values.host === "string" && values.host ? values.host : hostname());
    const pairing: Pairing = {
      url: `http://${host}:${config.server.port}`,
      token,
      name: config.discovery.name || `${config.name} on ${hostname().replace(/\.local$/, "")}`,
    };
    const link = pairingLink(pairing);
    const grid = qrModules(link);

    if (values.json) {
      printJson({ url: pairing.url, name: pairing.name, link, svg: svgCode(grid) });
      return;
    }
    headline("Pair a phone");
    process.stdout.write(
      [
        "",
        "    In the Parlour app: Settings, Scan pairing code. Or point the Camera at it.",
        "",
        terminalCode(grid),
        "",
        `    ${pairing.name} at ${pairing.url}`,
        dim("    The code carries the access token. Anyone who can see it can let a phone in."),
        dim("    Wrong address? parlour pair --host <name or IP>"),
        "",
      ].join("\n"),
    );
  },
};
