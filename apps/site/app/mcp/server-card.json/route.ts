import { mcpInfo } from "@/lib/mcp";
import { absolute } from "@/lib/site";

export const dynamic = "force-static";

// The MCP server card, served at /.well-known/mcp/server-card.json and
// /.well-known/mcp.json by the rewrites in next.config.ts.
export function GET() {
  return Response.json({
    name: mcpInfo.name,
    title: mcpInfo.title,
    version: mcpInfo.version,
    description: mcpInfo.description,
    serverInfo: { name: mcpInfo.name, title: mcpInfo.title, version: mcpInfo.version },
    websiteUrl: absolute("/"),
    documentationUrl: absolute("/docs"),
    transport: { type: "streamable-http", url: absolute("/mcp") },
    remotes: [{ type: "streamable-http", url: absolute("/mcp") }],
    authentication: { required: false, schemes: [] },
    capabilities: { tools: { listChanged: false } },
    tools: mcpInfo.tools,
  });
}
