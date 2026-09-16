import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { logger } from "../logger.ts";
import type { Connector, ConnectorStore } from "./store.ts";

const log = logger("connectors");

/**
 * The OAuth half of a connector.
 *
 * The MCP specification already says how a client signs in to a remote server:
 * discover the authorisation server, register dynamically if it allows it,
 * then run authorisation code with PKCE. The SDK implements all of that, so
 * what is left here is where the results are kept (the Keychain) and how the
 * person is asked (a browser window and a loopback redirect). There is no
 * per-service code: adding a connector is a name and a URL.
 */
export class KeychainProvider implements OAuthClientProvider {
  readonly #store: ConnectorStore;
  readonly #connector: Connector;
  readonly #redirect: string;
  readonly #open: (url: URL) => void;

  constructor(store: ConnectorStore, connector: Connector, redirect: string, open: (url: URL) => void) {
    this.#store = store;
    this.#connector = connector;
    this.#redirect = redirect;
    this.#open = open;
  }

  get redirectUrl(): string {
    return this.#redirect;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Home agent",
      redirect_uris: [this.#redirect],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // A desktop client cannot keep a secret, so it does not pretend to.
      token_endpoint_auth_method: "none",
      ...(this.#connector.scope ? { scope: this.#connector.scope } : {}),
    };
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const { client } = await this.#store.secrets(this.#connector.name);
    return client as OAuthClientInformationMixed | undefined;
  }

  async saveClientInformation(client: OAuthClientInformationMixed): Promise<void> {
    await this.#merge({ client: client as Record<string, unknown> });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const { tokens } = await this.#store.secrets(this.#connector.name);
    return tokens as OAuthTokens | undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.#merge({ tokens: tokens as unknown as Record<string, unknown> });
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await this.#merge({ verifier });
  }

  async codeVerifier(): Promise<string> {
    const { verifier } = await this.#store.secrets(this.#connector.name);
    if (!verifier) throw new Error("no PKCE verifier saved: start the sign in again");
    return verifier;
  }

  redirectToAuthorization(url: URL): void {
    this.#open(url);
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): Promise<void> {
    if (scope === "all" || scope === "client") await this.#store.clearSecrets(this.#connector.name);
    else if (scope === "tokens") await this.#merge({ tokens: undefined });
    else if (scope === "verifier") await this.#merge({ verifier: undefined });
  }

  async #merge(patch: {
    tokens?: Record<string, unknown>;
    client?: Record<string, unknown>;
    verifier?: string;
  }): Promise<void> {
    const current = await this.#store.secrets(this.#connector.name);
    await this.#store.saveSecrets(this.#connector.name, { ...current, ...patch });
  }
}

/** Silent refresh, for use when the agent starts rather than when a person is watching. */
export function providerFor(store: ConnectorStore, connector: Connector): OAuthClientProvider {
  return new KeychainProvider(store, connector, "http://127.0.0.1:0/callback", (url) => {
    // Reaching here means the stored tokens are gone or were rejected. There
    // is nobody at a keyboard, so say what to do rather than opening a window
    // on a headless Mac in a cupboard.
    log.warn(
      `${connector.name} needs signing in again: pnpm connectors add ${connector.name} ${connector.url}`,
    );
    log.debug("authorisation url", url.toString());
  });
}

/**
 * The interactive sign in: open a browser, catch the redirect on loopback,
 * exchange the code. Resolves once tokens are in the Keychain.
 */
export async function authorise(store: ConnectorStore, connector: Connector): Promise<void> {
  const codes = Promise.withResolvers<string>();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      response.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    response
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(
        `<!doctype html><meta charset="utf-8"><title>Home agent</title>` +
          `<body style="font:16px system-ui;padding:3rem;max-width:32rem;margin:auto">` +
          `<h1 style="font-size:1.1rem">${code ? `${connector.name} is connected.` : "That did not work."}</h1>` +
          `<p style="color:#666">${code ? "You can close this tab and go back to the terminal." : (error ?? "No authorisation code came back.")}</p>`,
      );
    if (code) codes.resolve(code);
    else codes.reject(new Error(error ?? "no authorisation code"));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const provider = new KeychainProvider(
      store,
      connector,
      `http://127.0.0.1:${port}/callback`,
      openInBrowser,
    );

    const result = await auth(provider, { serverUrl: connector.url, scope: connector.scope });
    if (result === "AUTHORIZED") return;

    log.info("waiting for the browser...");
    const code = await withTimeout(codes.promise, 5 * 60_000, "nobody finished signing in");
    const finished = await auth(provider, {
      serverUrl: connector.url,
      authorizationCode: code,
      scope: connector.scope,
    });
    if (finished !== "AUTHORIZED") throw new Error("the sign in did not complete");
  } finally {
    server.close();
  }
}

function openInBrowser(url: URL): void {
  console.log(
    `\nOpening your browser to sign in to the connector.\nIf nothing happens, open this:\n${url}\n`,
  );
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [url.toString()], { stdio: "ignore", detached: true }).unref();
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms).unref()),
  ]);
}
