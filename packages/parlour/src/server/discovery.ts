import { hostname } from "node:os";
import { Bonjour, type Service } from "bonjour-service";
import type { Config } from "../core/config.ts";
import { logger } from "../core/logger.ts";

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

/** Announce this server. Returns null when discovery is off. */
export function advertise(
  config: Config,
  details: { port: number; needsToken: boolean; tools: number },
): Advertisement | null {
  if (!config.discovery.enabled) return null;

  const name = config.discovery.name || `${config.name} on ${hostname().replace(/\.local$/, "")}`;
  const bonjour = new Bonjour();
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

  service.on("error", (error: Error) => log.warn("could not advertise:", error.message));
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
