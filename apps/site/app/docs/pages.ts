/**
 * The docs, in reading order. Each entry is a directory under app/docs with
 * a page.mdx in it; this list is what the index, the rail on every page and
 * the previous/next links at the bottom are drawn from.
 */
export interface DocPage {
  slug: string;
  title: string;
  summary: string;
}

export const docPages: DocPage[] = [
  {
    slug: "architecture",
    title: "Architecture",
    summary: "The ports, the provider registry, the session state machine, and why each part was chosen.",
  },
  {
    slug: "providers",
    title: "Writing a provider",
    summary: "Add a voice, an engine or an integration as an npm package, with a worked example.",
  },
  {
    slug: "clients",
    title: "Clients",
    summary: "Satellites, the phone page, custom hardware, the ask endpoint, and Bonjour.",
  },
  {
    slug: "home-assistant",
    title: "Home Assistant",
    summary:
      "The MCP Server integration, the OpenAI Conversation integration, muting, and moving over from the old config.",
  },
  {
    slug: "desktop",
    title: "The menu bar app",
    summary: "What the app does, how it drives the CLI, and how to run it against a checkout.",
  },
  {
    slug: "tuning",
    title: "Tuning",
    summary:
      "Wake sensitivity, how long it waits for you to finish, the voice, model sizes, and what to change when something is wrong.",
  },
  {
    slug: "wake-word",
    title: "Your own wake word",
    summary: "Train a wake word of your own and drop it in.",
  },
];

export function docPage(slug: string): DocPage | undefined {
  return docPages.find((page) => page.slug === slug);
}

/** The pages either side of this one in reading order. */
export function neighbours(slug: string): { previous?: DocPage; next?: DocPage } {
  const index = docPages.findIndex((page) => page.slug === slug);
  if (index < 0) return {};
  return { previous: docPages[index - 1], next: docPages[index + 1] };
}
