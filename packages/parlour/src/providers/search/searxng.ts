import { z } from "zod";
import type { Check, SearchProvider, SearchResult } from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";

/**
 * SearXNG is the default because it keeps queries in the house. Its JSON API
 * is off by default, so add `- json` to `search.formats` in `settings.yml`.
 */
export const SearxngSchema = z.object({
  url: z.string().url().default("http://searxng.local:8080"),
});

export type SearxngOptions = z.infer<typeof SearxngSchema>;

export class SearxngSearch implements SearchProvider {
  readonly #url: string;

  constructor(url: string) {
    this.#url = url;
  }

  async search(query: string, max: number): Promise<SearchResult[]> {
    const url = new URL("/search", this.#url);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`SearXNG ${response.status}`);
    const body = (await response.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return (body.results ?? []).slice(0, max).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.content ?? "",
    }));
  }

  /** A warning, not a failure: only the local model searches this way, and it answers without. */
  async doctor(): Promise<Check[]> {
    let ok = false;
    try {
      ok = (await fetch(new URL("/", this.#url), { signal: AbortSignal.timeout(4000) })).ok;
    } catch {
      ok = false;
    }
    return [
      {
        name: "SearXNG",
        status: ok ? "ok" : "warn",
        detail: `${this.#url}. Only the local model uses it; the cloud one searches for itself.`,
      },
    ];
  }
}

export function createSearxng(options: SearxngOptions, _context: ProviderContext): SearxngSearch {
  return new SearxngSearch(options.url);
}

export const searxngProvider = defineProvider<SearxngSearch>({
  kind: "search",
  name: "searxng",
  description: "A SearXNG instance on the house network, so searches never leave it",
  schema: SearxngSchema,
  create: (options, context) => createSearxng(options as SearxngOptions, context),
});

registerProvider(searxngProvider);
