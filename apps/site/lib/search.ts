import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

// One index over the docs, served to the search box at /api/search and to
// agents through the search tool at /mcp.
export const search = createFromSource(source);
