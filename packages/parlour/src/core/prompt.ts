export const ESCALATE_TOOL = "ask_the_clever_one";

export interface PromptOptions {
  /**
   * Whether the cloud model is there to hand over to. False when no key was
   * given, or when the person asked for a local-only house: the persona then
   * has to stop telling the model to escalate, because the tool it is being
   * told to call is not in its list.
   */
  escalation?: boolean;
}

/**
 * The persona does two jobs: it keeps replies short enough to listen to, and
 * it tells the small local model when to hand over. Both matter more than
 * tone. Everything here is spoken aloud, so there is no markdown, no lists and
 * no entity ids read out in full.
 */
export function systemPrompt(
  name: string,
  extra: string[] = [],
  locale = "en-GB",
  options: PromptOptions = {},
): string {
  const escalation = options.escalation ?? true;
  // The locale decides how the date reads and which English (or which
  // language) the model answers in, so "en-US" in config.json changes both.
  const now = new Date().toLocaleString(locale, { dateStyle: "full", timeStyle: "short" });
  return [
    `You are ${name}, the assistant for this house. You are speaking out loud to the people who live here.`,
    "",
    "How to answer:",
    `- At most two short sentences. ${languageName(locale)}. No preamble, no markdown, no lists, no emoji.`,
    "- Everything you say is read by a speech synthesiser, so write it the way you would say it. No entity ids, no URLs, no code.",
    "- If you did something, say so in a few words. Do not narrate the steps.",
    "- If you do not know, say so plainly rather than guessing.",
    "",
    "Using tools:",
    "- To control the house, call a tool. Never claim to have done something you have not done.",
    "- Ask for a room only if the request is genuinely ambiguous.",
    ...(escalation
      ? [
          `- Call ${ESCALATE_TOOL} whenever the question needs real reasoning, current information from the web, or knowledge you are unsure of. Handing over is cheap and being wrong out loud is not.`,
        ]
      : // Local only: there is nobody to hand over to, so the model is told
        // to finish the job itself rather than to apologise for not being
        // the clever one. A small model that has been told to escalate and
        // has no escalation tool stalls instead of calling the tool that
        // would have turned the light off.
        [
          "- You are the only model in this house. There is nobody to hand the question to, so answer it yourself.",
          "- Work with the tools you have. Use several in turn when one answer depends on another.",
          "- For anything you cannot look up or control from here, say what you do know in a sentence and leave it there.",
        ]),
    "",
    `It is ${now}.`,
    ...extra,
  ].join("\n");
}

/**
 * "British English" for en-GB, "American English" for en-US, "Deutsch" for
 * de. Spelling it out beats handing the model a BCP 47 tag and hoping. The
 * config schema has already rejected anything ICU cannot parse; a tag it can
 * parse but has no name for comes back as the tag.
 */
function languageName(locale: string): string {
  return new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
}

export const escalateSpec = {
  name: ESCALATE_TOOL,
  description:
    "Hand the question to a larger model with web access. Use it for anything you are not confident about, anything about the world outside this house, and anything needing more than one step of reasoning.",
  inputSchema: {
    type: "object" as const,
    properties: {
      question: {
        type: "string",
        description: "The question to hand over, rewritten to stand on its own.",
      },
    },
    required: ["question"],
  },
};
