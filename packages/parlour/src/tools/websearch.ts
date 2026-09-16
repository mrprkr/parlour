import type { Config } from "../config.ts";
import { defineTool, type Tool } from "./registry.ts";

interface Result {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Search for the local model. The cloud model does not use this: it has web
 * search server side, which is both better and one fewer hop.
 *
 * SearXNG is the default because it keeps queries in the house. Its JSON API
 * is off by default, so add `- json` to `search.formats` in `settings.yml`.
 */
export function searchTool(config: Config, braveKey: string | undefined): Tool | null {
  const { provider, searxngUrl, maxResults } = config.search;
  if (provider === "none") return null;
  if (provider === "brave" && !braveKey) return null;

  return defineTool(
    "web_search",
    "Search the web for current information: news, opening hours, facts you do not know.",
    {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    async (args) => {
      const query = String(args.query);
      const results =
        provider === "searxng"
          ? await searxng(searxngUrl, query, maxResults)
          : await brave(braveKey!, query, maxResults);
      if (!results.length) return `No results for "${query}".`;
      return results.map((r, i) => `${i + 1}. ${r.title} (${r.url})\n${r.snippet}`).join("\n\n");
    },
  );
}

async function searxng(baseUrl: string, query: string, limit: number): Promise<Result[]> {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`SearXNG ${response.status}`);
  const body = (await response.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (body.results ?? []).slice(0, limit).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.content ?? "",
  }));
}

async function brave(key: string, query: string, limit: number): Promise<Result[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));
  const response = await fetch(url, {
    headers: { accept: "application/json", "x-subscription-token": key },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Brave ${response.status}`);
  const body = (await response.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] };
  };
  return (body.web?.results ?? []).slice(0, limit).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? "",
  }));
}
