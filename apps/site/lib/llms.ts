import { flattenTree } from "fumadocs-core/page-tree";
import { llms } from "fumadocs-core/source";
import { faq } from "@/lib/faq";
import {
  absolute,
  description,
  downloadUrl,
  githubUrl,
  issuesUrl,
  npmUrl,
  securityReportUrl,
  siteName,
  tagline,
} from "@/lib/site";
import { source } from "@/lib/source";

// The site as markdown, for agents and anything else that would rather not
// parse HTML: llms.txt, llms-full.txt, `/<page>.md` and the pages served to
// `Accept: text/markdown`. The docs come from their own MDX; the few pages
// written in TSX have a short markdown twin here.

type DocsPage = ReturnType<typeof source.getPages>[number];

async function renderDoc(page: DocsPage): Promise<string> {
  const body = (await page.data.getText("raw")).replace(/^---\n[\s\S]*?\n---\n/, "").trim();
  return `# ${page.data.title}\n\nSource: ${absolute(page.url)}\n\n> ${page.data.description}\n\n${body}\n`;
}

export const docs = llms(source, { renderPage: renderDoc });

const install = [
  "```sh",
  "npm install -g parlour",
  "parlour init          # gets what it needs, asks a few questions",
  "parlour text          # try it by typing, no microphone needed",
  "parlour start         # and now out loud",
  "```",
].join("\n");

const home = `# ${siteName}: a private voice assistant for your home

> ${tagline}

${description}

## What it does

- Say the wake word in any room and ask. Nothing is recorded until you do.
- Your words are transcribed on your Mac. The recording never leaves home.
- A model on your Mac answers, using Home Assistant, timers, search and the accounts you connect.
- Optionally, the local model can pass a single question, as text, to a cloud model (Claude) when it needs help. Never your voice, never the keys to your home.
- The answer is spoken back in the room you asked from.

One Mac is the hub. Everything else (another Mac, a phone, a Home Assistant Voice PE, custom hardware, an automation) is a client of it.

## Install

${install}

All you need is a Mac with Apple silicon, Node 22 and Homebrew. Or [download the menu bar app](${downloadUrl}).

## Price

Free and open source under the MIT licence. No account, no subscription. See [pricing](${absolute("/pricing")}).

## Links

- [Docs](${absolute("/docs")})
- [Help and FAQ](${absolute("/help")})
- [Contact](${absolute("/contact")})
- [Privacy policy](${absolute("/privacy")})
- [Source on GitHub](${githubUrl})
- [npm package](${npmUrl})
`;

const pricing = `# Pricing

Source: ${absolute("/pricing")}

Parlour is free and open source under the MIT licence.

| | Price |
| --- | --- |
| The \`parlour\` npm package (CLI and server) | Free |
| Parlour Server, the menu bar app for macOS | Free |
| The source code | Free, MIT licence |
| Account or subscription | None needed |

Optional costs are yours and paid to others: a cloud model such as Claude is billed by its provider for the questions you send it, and a search provider may charge for its API. Leave them out and Parlour runs entirely on your Mac at no cost.

Parlour Cloud, an optional paid service, does not exist yet. If it launches it will be opt-in, and everything above stays free.

- Install: \`npm install -g parlour\`
- Download the menu bar app: ${downloadUrl}
`;

const contact = `# Contact

Source: ${absolute("/contact")}

Parlour is an open source project, and it is run in the open on GitHub.

- Bugs, questions and feature requests: open an issue at ${issuesUrl}
- Security problems: report privately at ${securityReportUrl}, not in a public issue.
- Privacy questions: open an issue, or use the private report for anything you would rather not say in public.
- Contributions: pull requests are welcome at ${githubUrl}. Providers are the most useful thing to add.

Before you write, the [help page](${absolute("/help")}) and the [docs](${absolute("/docs")}) may already have the answer.
`;

const help = `# Help

Source: ${absolute("/help")}

${faq
  .map(
    (item) =>
      `## ${item.question}\n\n${item.answer}${item.more ? `\n\nMore: [${item.more.label}](${absolute(item.more.href)})` : ""}`,
  )
  .join("\n\n")}
`;

/** The markdown for a path on the site, or null when it has none. */
export async function markdownFor(slug: string[]): Promise<string | null> {
  const path = slug.join("/");
  if (path === "") return home;
  if (path === "pricing") return pricing;
  if (path === "contact") return contact;
  if (path === "help") return help;
  if (slug[0] === "docs") {
    const page = source.getPage(slug.slice(1));
    return page ? docs.page(page) : null;
  }
  return null;
}

/** Every path with a markdown twin, for generateStaticParams. */
export function markdownPaths(): string[][] {
  return [
    [],
    ["pricing"],
    ["contact"],
    ["help"],
    ...source.getPages().map((page) => ["docs", ...page.slugs]),
  ];
}

/** The public address of a page's markdown twin. */
export function markdownUrl(url: string): string {
  return absolute(url === "/" ? "/index.md" : `${url}.md`);
}

/** The docs in the order meta.json reads them, not the order of the files. */
function inReadingOrder(): DocsPage[] {
  const order = flattenTree(source.getPageTree().children).map((item) => item.url);
  const rank = (page: DocsPage) => {
    const at = order.indexOf(page.url);
    return at === -1 ? order.length : at;
  };
  return source.getPages().sort((a, b) => rank(a) - rank(b));
}

export function llmsTxt(): string {
  const pages = inReadingOrder();
  return `# ${siteName}

> ${description}

Parlour is a local-first voice assistant for the house. It runs on a Mac with Apple silicon and talks to Home Assistant. It is free and open source (MIT), with no account and no server of ours in the middle. Install it with \`npm install -g parlour\`, then \`parlour init\`.

Every page below is also served as markdown: add \`.md\` to its address, or ask for it with \`Accept: text/markdown\`.

## Docs

${pages.map((page) => `- [${page.data.title}](${markdownUrl(page.url)}): ${page.data.description}`).join("\n")}

## Site

- [Home](${markdownUrl("/")}): what Parlour is and how to install it
- [Pricing](${markdownUrl("/pricing")}): free and open source, and what optional services cost
- [Help](${markdownUrl("/help")}): answers to common questions
- [Contact](${markdownUrl("/contact")}): where to report a bug, a security problem or ask a question
- [Privacy policy](${absolute("/privacy")})

## For agents

- [Docs MCP server](${absolute("/mcp")}): streamable HTTP, no sign-in. Tools: search, list_pages, get_page.
- [HTTP API of a Parlour server](${absolute("/openapi.json")}): OpenAPI for the server that runs on your own Mac. It is not hosted here.
- [Agent guide](${absolute("/.well-known/agents.md")})

## Optional

- [Everything in one file](${absolute("/llms-full.txt")})
- [Source on GitHub](${githubUrl})
- [npm package](${npmUrl})
`;
}
