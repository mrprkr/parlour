import { z } from "zod";
import type { Check, SearchProvider, SearchResult } from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";

/**
 * The hosted fallback for a house without SearXNG. Nothing to configure: the
 * key comes from `BRAVE_API_KEY` in secrets, like every other secret.
 */
export const BraveSchema = z.object({});

export type BraveOptions = z.infer<typeof BraveSchema>;

export class BraveSearch implements SearchProvider {
  readonly #key: string;

  constructor(key: string) {
    this.#key = key;
  }

  async search(query: string, max: number): Promise<SearchResult[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(max));
    const response = await fetch(url, {
      headers: { accept: "application/json", "x-subscription-token": this.#key },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Brave ${response.status}`);
    const body = (await response.json()) as {
      web?: { results?: { title?: string; url?: string; description?: string }[] };
    };
    return (body.web?.results ?? []).slice(0, max).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.description ?? "",
    }));
  }

  /** No request: each one is metered, and the key is the only thing that goes wrong here. */
  async doctor(): Promise<Check[]> {
    return [{ name: "Brave search", status: "ok", detail: "BRAVE_API_KEY is set" }];
  }
}

export function createBrave(_options: BraveOptions, context: ProviderContext): BraveSearch {
  const key = context.secrets.braveKey;
  if (!key) throw new Error("BRAVE_API_KEY is not set");
  return new BraveSearch(key);
}

export const braveProvider = defineProvider<BraveSearch>({
  kind: "search",
  name: "brave",
  description: "Brave's hosted search API, for a house without SearXNG",
  schema: BraveSchema,
  create: (options, context) => createBrave(options as BraveOptions, context),
});

registerProvider(braveProvider);
