import { absolute } from "@/lib/site";

export const dynamic = "force-static";

// Everything here is public and written to be read, by people and by agents
// alike, so every crawler is welcome, and the AI crawlers are named so none of
// them has to guess. Content-Signal (contentsignals.org) says the same for use:
// search and answers yes, and training too, since the project is MIT licensed.
const agents = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "meta-externalagent",
  "CCBot",
  "DuckAssistBot",
  "MistralAI-User",
];

const rules = ["Content-Signal: search=yes, ai-input=yes, ai-train=yes", "Allow: /", "Disallow: /api/"];

export function GET() {
  const body = [
    ...agents.flatMap((agent) => [`User-agent: ${agent}`, ...rules, ""]),
    "User-agent: *",
    ...rules,
    "",
    `Sitemap: ${absolute("/sitemap.xml")}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
