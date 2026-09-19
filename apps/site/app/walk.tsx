"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { steps } from "./steps";

// How long each callout stays lit when the walk plays itself.
const beat = 2200;
const last = steps.length;

/**
 * The plate and its key. One sentence walks through the house one callout at
 * a time: press play, step with the arrows, or pick a number in the key. The
 * drawing is lit by `data-step` and CSS, so with no JavaScript the whole
 * plate still renders, unlit, with every callout in place.
 */
export function Walk({ figure }: { figure: ReactNode }) {
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

  // On a phone the plate pans sideways; bring the lit callout into view.
  useEffect(() => {
    const root = plate.current;
    if (!root || step === 0) return;
    if (root.scrollWidth <= root.clientWidth) return;
    const disc = root.querySelector<SVGGElement>(`.c${step}`);
    disc?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
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

  // The arrow keys step the walk from any of its controls, so the key list
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
    <div className="walk" data-step={step}>
      <figure className="plate-figure">
        <div className="plate" ref={plate}>
          {figure}
        </div>
        <figcaption className="caption">
          <p className="pan-cue">
            The plate is wider than the page; drag it sideways, or step through the key.
          </p>
          <p className="now" aria-live="polite">
            {current ? (
              <>
                <span className="disc-inline">{current.n}</span>
                <strong>{current.what}</strong> {current.how}
              </>
            ) : (
              <>Fig. 1. The house, cut open, with Parlour in it. Everything numbered is listed in the key.</>
            )}
          </p>
        </figcaption>
      </figure>

      <aside className="key" aria-label="Key">
        <h2>Key</h2>
        <div className="transport">
          <button type="button" className="play" onClick={play} onKeyDown={onKey} aria-pressed={playing}>
            {playing ? "Pause" : step >= last ? "Again" : "Follow one sentence"}
          </button>
          <button
            type="button"
            className="stepper"
            onClick={() => go(step - 1)}
            onKeyDown={onKey}
            disabled={step <= 0}
            aria-label="Back"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3 5 8l5 5" />
            </svg>
          </button>
          <button
            type="button"
            className="stepper"
            onClick={() => go(step + 1)}
            onKeyDown={onKey}
            disabled={step >= last}
            aria-label="Next"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m6 3 5 5-5 5" />
            </svg>
          </button>
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
                <span className="what">{s.what}</span>
                <span className="how">{s.how}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
