import { bold, dim, green } from "./output.ts";
import { allowBack, answeredCount, GoBack } from "./prompts.ts";

/**
 * The questions of `parlour init` as a list of steps rather than as one long
 * function, so a person can go back and change an answer. Each step reads and
 * writes one shared answers object and nothing else: whatever the answers
 * are for (downloads, services, config) happens after the last step, so going
 * back never has anything to undo.
 *
 * Two ways to run. At a terminal it is a small full screen app: each step is
 * drawn on a clean screen under the list of sections, Escape goes back, and
 * the last step is a review. Everywhere else (`--yes`, a pipe, the desktop
 * app) the steps run once, in order, reporting as they go, exactly as the
 * installer always has.
 */

export interface Step<S> {
  /** The part of setup this belongs to, shown in the row of sections along the top. */
  section: string;
  /** The heading over the question. Steps sharing one are reported under a single heading. */
  title: string;
  /** A few lines of why, printed under the heading. */
  intro?: (state: S) => string[];
  /** Skipped, going forwards and backwards, while this is false. */
  when?: (state: S) => boolean;
  run: (state: S) => Promise<void>;
}

/** Thrown from a step to go to the first step of a section, which is how the review changes an answer. */
export class GoTo extends Error {
  readonly section: string;
  constructor(section: string) {
    super(`Went to ${section}.`);
    this.name = "GoTo";
    this.section = section;
  }
}

export interface WizardOptions {
  /** A terminal and nobody said `--yes`: draw the screens and let Escape go back. */
  interactive: boolean;
  /** How a heading and its lines are reported when not interactive. */
  report: { step(text: string): void; ok(text: string): void };
  /** The name at the top of every screen. */
  heading: string;
}

const ALT_SCREEN = "\x1b[?1049h";
const MAIN_SCREEN = "\x1b[?1049l";
const CLEAR = "\x1b[H\x1b[2J";

export async function runWizard<S>(steps: Step<S>[], state: S, options: WizardOptions): Promise<void> {
  const visible = (index: number) => steps[index]?.when?.(state) ?? true;
  const next = (from: number) => {
    let index = from;
    while (index < steps.length && !visible(index)) index++;
    return index;
  };

  if (!options.interactive) {
    let heading = "";
    for (const [index, step] of steps.entries()) {
      if (!visible(index)) continue;
      if (step.title !== heading) {
        heading = step.title;
        options.report.step(step.title);
        for (const text of step.intro?.(state) ?? []) options.report.ok(text);
      }
      await step.run(state);
    }
    return;
  }

  const out = process.stdout;
  // The steps that asked something, most recent last: where Escape goes.
  const history: number[] = [];
  let index = next(0);
  out.write(ALT_SCREEN);
  allowBack(true);
  try {
    while (index < steps.length) {
      const step = steps[index] as Step<S>;
      draw(steps, index, state, options.heading, visible);
      const before = answeredCount();
      try {
        await step.run(state);
        if (answeredCount() > before) history.push(index);
        index = next(index + 1);
      } catch (error) {
        if (error instanceof GoBack) {
          // Half way through a step, back is the start of the same step;
          // from its first question, it is the last step that asked anything.
          if (answeredCount() === before) index = history.pop() ?? index;
        } else if (error instanceof GoTo) {
          history.push(index);
          const target = steps.findIndex(
            (candidate, at) => candidate.section === error.section && visible(at),
          );
          if (target >= 0) index = target;
        } else {
          throw error;
        }
      }
    }
  } finally {
    allowBack(false);
    out.write(MAIN_SCREEN);
  }
}

/** A clean screen: the name, the sections with where this step is among them, then the heading and why. */
function draw<S>(
  steps: Step<S>[],
  current: number,
  state: S,
  heading: string,
  visible: (index: number) => boolean,
): void {
  const out = process.stdout;
  const shown = steps.map((_, index) => index).filter(visible);
  const sections = [...new Set(shown.map((index) => (steps[index] as Step<S>).section))];
  const step = steps[current] as Step<S>;
  const here = sections.indexOf(step.section);
  const trail = sections
    .map((section, position) =>
      position < here
        ? `${green("✓")} ${dim(section)}`
        : position === here
          ? bold(`› ${section}`)
          : dim(`· ${section}`),
    )
    .join(dim("   "));
  const count = dim(`${shown.indexOf(current) + 1} of ${shown.length}`);

  out.write(CLEAR);
  out.write(`\n  ${bold(heading)}   ${count}\n\n  ${trail}\n\n`);
  out.write(`${bold(`==> ${step.title}`)}\n`);
  for (const text of step.intro?.(state) ?? []) out.write(`    ${text}\n`);
  out.write("\n");
}
