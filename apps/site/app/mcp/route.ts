import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { registerSearchTool, registerSourceTools } from "fumadocs-core/mcp";
import { docs } from "@/lib/llms";
import { mcpInfo } from "@/lib/mcp";
import { search } from "@/lib/search";
import { source } from "@/lib/source";

// A read-only MCP server over the docs, so an agent can look something up
// without scraping. Stateless: every request gets a fresh server, and there
// is nothing to sign in to because there is nothing private behind it.
const handler = createMcpHandler(() => {
  const server = new McpServer(
    { name: mcpInfo.name, title: mcpInfo.title, version: mcpInfo.version },
    { instructions: mcpInfo.instructions },
  );
  registerSearchTool(server, search);
  registerSourceTools(server, source, docs);
  return server;
});

function serve(request: Request): Promise<Response> {
  return handler.fetch(request);
}

export { serve as DELETE, serve as GET, serve as POST };
