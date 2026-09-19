"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { steps } from "./steps";

// A stage lights once its entry has risen past this line down the viewport.
const trigger = 0.58;

/**
 * The diagram and its stages, driven by the scroll. The drawing sticks while
 * the stages pass it, and whichever stage is at the trigger line lights the
 * path up to itself. Nothing here is a control: the page's own scroll is the
 * only input, and with no JavaScript the drawing and all seven stages still
 * render, unlit and complete.
 */
export function Flow({ figure }: { figure: ReactNode }) {
  const [step, setStep] = useState(0);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const root = list.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLLIElement>("li"));
    if (items.length === 0) return;

    let frame = 0;

    function measure() {
      frame = 0;
      const line = window.innerHeight * trigger;
      let active = 0;
      for (let i = 0; i < items.length; i++) {
        if (items[i].getBoundingClientRect().top <= line) active = i + 1;
      }
      setStep((current) => (current === active ? current : active));
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="flow" data-step={step}>
      <figure className="flow-figure">
        <div className="plate">{figure}</div>
        <figcaption className="caption">
          <p>Scroll to follow a question through. Six of its seven stages never leave your Mac.</p>
        </figcaption>
      </figure>

      <div className="key">
        <h2>Stages</h2>
        <ol className="key-list" ref={list}>
          {steps.map((s) => (
            <li key={s.n} className={s.n === step ? "lit" : undefined}>
              <span className="disc-inline">{s.n}</span>
              <span className="what">{s.label}</span>
              <span className="how">{s.how}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
