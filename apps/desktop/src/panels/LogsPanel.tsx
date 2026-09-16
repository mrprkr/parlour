import { type JSX, useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** The old UI's slack, in pixels, before a reader counts as scrolled away. */
const BOTTOM_SLACK = 20;

/**
 * The agent's output, verbatim.
 *
 * A plain scrollable `<pre>` rather than a ScrollArea: the sticky-bottom rule
 * needs the scrolling element itself, and the ScrollArea primitive keeps its
 * viewport to itself. Whether the reader is at the bottom is remembered on
 * every scroll instead of measured when the lines change, because by then
 * React has already painted the new line and the old position is gone.
 */
export function LogsPanel({ lines }: { lines: string[] }): JSX.Element {
  const log = useRef<HTMLPreElement>(null);
  const stuck = useRef(true);

  const remember = useCallback(() => {
    const el = log.current;
    // A hidden box measures nothing, and hiding it can reset the scroll and say
    // so. Reading that as "at the bottom" would lose the reader's place while
    // they are on another tab.
    if (!el || el.clientHeight === 0) return;
    stuck.current = el.scrollTop + el.clientHeight >= el.scrollHeight - BOTTOM_SLACK;
  }, []);

  useLayoutEffect(() => {
    const el = log.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // A tab switch can mount this with no height, or hand it one a frame later,
  // and a scroll to the bottom of a zero-height box goes nowhere. Following
  // the box's own size puts it back on the newest line when it appears.
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stuck.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <pre
      ref={log}
      onScroll={remember}
      aria-label="Agent log"
      tabIndex={0}
      className="m-0 h-full min-h-40 overflow-y-auto rounded-lg border border-border bg-card p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-card-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {lines.length > 0 ? (
        lines.join("\n")
      ) : (
        <span className="text-muted-foreground">Nothing yet. The agent writes here as it runs.</span>
      )}
    </pre>
  );
}
