import { createSocket } from "node:dgram";
import type { EventEmitter } from "node:events";
import { hostname } from "node:os";
import { Bonjour, type Service } from "bonjour-service";
import type { Config } from "../core/config.ts";
import { logger } from "../core/logger.ts";
import type { Check } from "../core/ports.ts";

const log = logger("discovery");

/**
 * Bonjour, so that nothing in the house has to be told an IP address.
 *
 * The server advertises `_parlour._tcp`; satellites and phones browse for
 * it. This is the same mechanism Home Assistant, printers and AirPlay use, so
 * it works on the network people already have, survives the router handing out
 * a different address, and needs nothing configured on either end.
 */

export const SERVICE_TYPE = "parlour";

export interface Found {
  name: string;
  host: string;
  port: number;
  /** http://host:port, ready to use. */
  url: string;
  /** True when the server will refuse anything without a token. */
  needsToken: boolean;
}

export interface Advertisement {
  name: string;
  stop(): Promise<void>;
}

/** Where mDNS lives: the link-local multicast group every Bonjour responder listens on. */
const MDNS_GROUP = "224.0.0.251";
const MDNS_PORT = 5353;

/**
 * What a send to the house network fails with when macOS will not let this
 * process onto it. Since macOS 15 that is local network privacy: until the
 * person allows it in System Settings, a packet for anything on the LAN, the
 * mDNS group included, is refused with no route to host. A sandbox without
 * the network entitlements refuses with a permission error instead.
 */
const REFUSALS = new Set(["EHOSTUNREACH", "EPERM", "EACCES"]);

export function refusedLocalNetwork(error: unknown): boolean {
  return REFUSALS.has((error as NodeJS.ErrnoException | undefined)?.code ?? "");
}

/** Where the switch is, in the words System Settings uses. */
export const LOCAL_NETWORK_SETTING =
  "Turn it on in System Settings, Privacy & Security, Local Network: for Parlour Server, or for node or the terminal when Parlour was started from there";

/**
 * Explains a Bonjour failure. Only a refusal on a Mac gets the local network
 * advice: anywhere else there is no such switch, and the error says enough.
 */
export function describeDiscoveryError(error: unknown, platform: NodeJS.Platform = process.platform): string {
  const message = error instanceof Error ? error.message : String(error);
  if (platform === "darwin" && refusedLocalNetwork(error)) {
    return `macOS is keeping Parlour off the local network (${message}), so phones and satellites cannot find it. ${LOCAL_NETWORK_SETTING}.`;
  }
  return message;
}

/** One mDNS question for `_parlour._tcp.local`, PTR, class IN: the same thing a phone asks. */
export function mdnsQuery(): Buffer {
  const header = Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  const labels = [`_${SERVICE_TYPE}`, "_tcp", "local"].map((label) =>
    Buffer.concat([Buffer.from([label.length]), Buffer.from(label, "ascii")]),
  );
  return Buffer.concat([header, ...labels, Buffer.from([0, 0, 12, 0, 1])]);
}

type Send = (packet: Buffer) => Promise<void>;

/** Sends one packet to the mDNS group from a throwaway socket. */
const sendToGroup: Send = (packet) =>
  new Promise((resolve, reject) => {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    let done = false;
    const finish = (error?: Error | null) => {
      if (done) return;
      done = true;
      socket.close();
      if (error) reject(error);
      else resolve();
    };
    socket.once("error", finish);
    socket.send(packet, MDNS_PORT, MDNS_GROUP, finish);
  });

/**
 * Whether this process may talk to the house network at all, which on a Mac
 * is a permission rather than a given. Asking is also what raises the prompt
 * the first time, so running the doctor after install is enough to get it
 * out of the way.
 */
export async function localNetworkCheck(
  platform: NodeJS.Platform = process.platform,
  send: Send = sendToGroup,
): Promise<Check> {
  try {
    await send(mdnsQuery());
    return { name: "local network", status: "ok", detail: "allowed, so Bonjour can reach the house" };
  } catch (error) {
    const refused = platform === "darwin" && refusedLocalNetwork(error);
    // A refusal breaks everything that crosses the LAN. Anything else, such as
    // no multicast route, breaks only finding things, and an address set by
    // hand gets round that.
    return {
      name: "local network",
      status: refused ? "fail" : "warn",
      detail: refused
        ? `macOS is refusing Parlour the local network, so nothing in the house can find or reach it. ${LOCAL_NETWORK_SETTING}. If it is already on, this Mac may be on no network at all.`
        : `could not send to the mDNS group: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Announce this server. Returns null when discovery is off. */
export function advertise(
  config: Config,
  details: { port: number; needsToken: boolean; tools: number },
): Advertisement | null {
  if (!config.discovery.enabled) return null;

  const name = config.discovery.name || `${config.name} on ${hostname().replace(/\.local$/, "")}`;
  // Without a callback, bonjour-service throws a failed answer out of a socket
  // callback, which takes the whole server down the moment macOS refuses the
  // local network or Wi-Fi drops. Losing discovery is worth a line in the log,
  // not the house. Each failure is said once: a refusal repeats with every
  // question heard.
  const reported = new Set<string>();
  const report = (error: unknown) => {
    const key = (error as NodeJS.ErrnoException | undefined)?.code ?? String(error);
    if (reported.has(key)) return;
    reported.add(key);
    log.warn("could not advertise:", describeDiscoveryError(error));
  };
  const bonjour = new Bonjour({}, report);
  // The same goes for the socket failing to bind, which the library emits
  // as an 'error' nothing listens for. It keeps the socket private.
  (bonjour as unknown as { server?: { mdns?: EventEmitter } }).server?.mdns?.on("error", report);
  const service = bonjour.publish({
    name,
    type: SERVICE_TYPE,
    port: details.port,
    txt: {
      // Small and stable: a TXT record is not the place for status. Anything
      // that changes while running belongs on /health.
      role: "server",
      version: "1",
      token: details.needsToken ? "required" : "none",
      api: "/v1",
    },
  });

  service.on("error", report);
  log.info(`advertised as "${name}" on _${SERVICE_TYPE}._tcp`);

  return {
    name,
    stop: () =>
      new Promise((resolve) => {
        service.stop?.(() => {
          bonjour.destroy();
          resolve();
        });
        // destroy() on its own is enough if stop takes no callback.
        setTimeout(() => resolve(), 1000).unref();
      }),
  };
}

/**
 * Find the server. Resolves to null rather than throwing, because a satellite
 * that cannot find the house yet should wait and try again, not die.
 */
export function findServer(timeoutMs = 5000): Promise<Found | null> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    let settled = false;

    const done = (found: Found | null) => {
      if (settled) return;
      settled = true;
      bonjour.destroy();
      resolve(found);
    };

    bonjour.findOne({ type: SERVICE_TYPE }, timeoutMs, (service?: Service) => {
      if (!service) return done(null);
      // Prefer the advertised name: an address can change under a long lived
      // satellite and ".local" keeps working when it does. A bare name with no
      // domain is not resolvable by anyone else, so fall back to the address.
      const advertised = service.host?.replace(/\.$/, "");
      const address = service.addresses?.find((candidate) => candidate.includes("."));
      const host = advertised?.includes(".") ? advertised : (address ?? advertised);
      if (!host) return done(null);
      done({
        name: service.name,
        host,
        port: service.port,
        url: `http://${host}:${service.port}`,
        needsToken: (service.txt as Record<string, string> | undefined)?.token !== "none",
      });
    });

    setTimeout(() => done(null), timeoutMs + 500).unref();
  });
}
