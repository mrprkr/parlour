import type { SearchProvider } from "./ports.ts";
import { defineTool, type Tool } from "./registry.ts";

/**
 * Search for the local model. The cloud model does not use this: it has web
 * search server side, which is both better and one fewer hop.
 *
 * Which engine answers is the provider's business; this is only the tool
 * shape the model sees and the way results are read back to it.
 */
export function searchTool(provider: SearchProvider, maxResults: number): Tool {
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
      const results = await provider.search(query, maxResults);
      if (!results.length) return `No results for "${query}".`;
      return results.map((r, i) => `${i + 1}. ${r.title} (${r.url})\n${r.snippet}`).join("\n\n");
    },
  );
}
