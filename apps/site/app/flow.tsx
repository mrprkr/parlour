"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { steps } from "./steps";

// How long each stage stays lit when the sequence plays itself.
const beat = 2200;
const last = steps.length;

/**
 * The diagram and its key, joined. Play it, step it with the arrows, or pick
 * a stage from the list. The drawing is lit by `data-step` and CSS alone, so
 * without JavaScript the diagram and every stage still render, unlit.
 */
export function Flow({ figure }: { figure: ReactNode }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const plate = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStep((s) => s + 1), beat);
    return () => clearTimeout(timer);
  }, [playing, step]);

  // On a narrow screen the diagram pans; bring the lit stage into view.
  useEffect(() => {
    const root = plate.current;
    if (!root || step === 0) return;
    if (root.scrollWidth <= root.clientWidth) return;
    const node = root.querySelector<SVGGElement>(`.node.s${step}`);
    node?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [step]);

  function go(n: number) {
    setPlaying(false);
    setStep(Math.max(0, Math.min(last, n)));
  }

  function play() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (step === 0 || step >= last) setStep(1);
    setPlaying(true);
  }

  // The arrow keys drive the sequence from any of its controls, so the list
  // and the transport are one instrument.
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      go(step + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      go(step - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      go(0);
    }
  }

  const current = steps.find((s) => s.n === step);

  return (
    <div className="flow" data-step={step}>
      <figure className="flow-figure">
        <div className="plate" ref={plate}>
          {figure}
        </div>
        <figcaption className="caption">
          <p className="pan-cue">
            The diagram is wider than the screen; drag it, or step through the stages.
          </p>
          <p>Seven stages. Six of them never leave the machine on your desk.</p>
          <p className="visually-hidden" aria-live="polite">
            {current ? `Stage ${current.n}. ${current.label}. ${current.how}` : ""}
          </p>
        </figcaption>
      </figure>

      <aside className="key" aria-label="The stages">
        <div className="key-head">
          <h2>Stages</h2>
          <div className="transport">
            <button type="button" className="play" onClick={play} onKeyDown={onKey} aria-pressed={playing}>
              {playing ? "Pause" : step >= last ? "Again" : "Follow a question"}
            </button>
            <button
              type="button"
              className="stepper"
              onClick={() => go(step - 1)}
              onKeyDown={onKey}
              disabled={step <= 0}
            >
              Back
            </button>
            <button
              type="button"
              className="stepper"
              onClick={() => go(step + 1)}
              onKeyDown={onKey}
              disabled={step >= last}
            >
              Next
            </button>
          </div>
        </div>
        <ol className="key-list">
          {steps.map((s) => (
            <li key={s.n} className={s.n === step ? "lit" : undefined}>
              <button
                type="button"
                onClick={() => go(s.n === step ? 0 : s.n)}
                onKeyDown={onKey}
                aria-pressed={s.n === step}
              >
                <span className="disc-inline">{s.n}</span>
                <span className="what">{s.label}</span>
                <span className="how">{s.how}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
