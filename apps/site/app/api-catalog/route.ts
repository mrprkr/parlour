import { absolute } from "@/lib/site";

export const dynamic = "force-static";

// RFC 9727's API catalogue, served at /.well-known/api-catalog: the docs MCP
// server and the OpenAPI description of a Parlour server, each with its docs.
export function GET() {
  const linkset = {
    linkset: [
      {
        anchor: absolute("/mcp"),
        "service-desc": [{ href: absolute("/.well-known/mcp/server-card.json"), type: "application/json" }],
        "service-doc": [{ href: absolute("/docs"), type: "text/html" }],
      },
      {
        anchor: "http://localhost:8765/",
        "service-desc": [{ href: absolute("/openapi.json"), type: "application/openapi+json" }],
        "service-doc": [{ href: absolute("/docs/api"), type: "text/html" }],
      },
    ],
  };
  return new Response(JSON.stringify(linkset), {
    headers: {
      "content-type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
    },
  });
}
