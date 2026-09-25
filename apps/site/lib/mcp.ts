import { siteName } from "@/lib/site";

// What the docs MCP server at /mcp says about itself. The route and its
// server card both read this, so the card cannot promise a tool the server
// does not have.
export const mcpInfo = {
  name: "parlour-docs",
  title: `${siteName} docs`,
  version: "1.0.0",
  description:
    "Search and read the Parlour docs: how to install Parlour, connect Home Assistant, add clients, and write providers and skills. Read only, no sign-in.",
  instructions:
    "Parlour is a free, open source voice assistant that runs on the user's own Mac. Use search to find a docs page, list_pages to see them all, and get_page with a page's URL (such as /docs/getting-started) for its markdown. This server reads the docs only; it cannot reach anyone's Parlour or their house.",
  tools: [
    { name: "search", description: "Search the docs with a query" },
    { name: "list_pages", description: "List every docs page with its URL" },
    { name: "get_page", description: "Get a docs page as markdown by its URL" },
  ],
};
