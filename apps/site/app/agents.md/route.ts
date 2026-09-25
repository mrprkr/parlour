import { absolute, downloadUrl, githubUrl, issuesUrl, securityReportUrl } from "@/lib/site";

export const dynamic = "force-static";

// A guide for an agent acting for someone, served at /.well-known/agents.md.
const guide = `# Parlour, for agents

Parlour is a free, open source (MIT) voice assistant for the house. It runs on the user's own Mac with Apple silicon and talks to Home Assistant. There is no account, no sign-in, no checkout and no hosted service: nothing on this site needs credentials, and no task here needs a browser.

## What you can do for a user

- Answer questions about Parlour: read ${absolute("/llms.txt")}, any page as markdown (add \`.md\` to its address, or send \`Accept: text/markdown\`), or everything at once at ${absolute("/llms-full.txt")}.
- Search and read the docs over MCP at ${absolute("/mcp")} (streamable HTTP, no auth; tools: search, list_pages, get_page).
- Install it, on the user's Mac and with their go-ahead: \`npm install -g parlour\`, then \`parlour init\`. The menu bar app is at ${downloadUrl}.
- Talk to the user's own Parlour server once it runs: its HTTP API is described at ${absolute("/openapi.json")} and in ${absolute("/docs/api")}. It lives on their network, needs their PARLOUR_TOKEN, and is never reachable through this site.
- Price: free. See ${absolute("/pricing")}.

## Getting help

- Common questions: ${absolute("/help")}
- Bugs and questions: ${issuesUrl}
- Security problems, privately: ${securityReportUrl}
- Source: ${githubUrl}
`;

export function GET() {
  return new Response(guide, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
