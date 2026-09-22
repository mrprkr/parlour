// The pieces the onboarding is drawn from. None of them knows about Parlour;
// they are here so the steps in Onboarding.tsx read as what they ask, not as
// markup.

import { Check as CheckIcon, ChevronRight, CircleDashed, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { type JSX, type ReactNode, useId, useState } from "react";
import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "bad" | "busy" | "todo";

export function Mark({ tone, className }: { tone: Tone; className?: string }): JSX.Element {
  const Icon =
    tone === "ok"
      ? CheckIcon
      : tone === "bad"
        ? X
        : tone === "busy"
          ? LoaderCircle
          : tone === "todo"
            ? CircleDashed
            : TriangleAlert;
  return (
    <Icon
      aria-hidden
      className={cn(
        "mt-0.5 size-4 shrink-0",
        tone === "ok" && "text-primary",
        tone === "warn" && "text-warn",
        tone === "bad" && "text-destructive",
        tone === "busy" && "animate-spin text-muted-foreground",
        tone === "todo" && "text-muted-foreground",
        className,
      )}
    />
  );
}

/** One thing that is or is not in place, with a sentence on why and an optional control. */
export function Row({
  tone,
  name,
  detail,
  children,
}: {
  tone: Tone;
  name: string;
  detail?: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  return (
    <li className="flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5">
      <Mark tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{name}</div>
        {detail ? <div className="text-muted-foreground">{detail}</div> : null}
        {children}
      </div>
    </li>
  );
}

/**
 * The detail nobody needs until they do: the log, the path to a copy of
 * parlour kept somewhere odd, how to find a token. Closed until asked for,
 * unless the caller knows it is wanted (a failed install opens its log).
 */
export function Disclosure({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}): JSX.Element {
  const [own, setOwn] = useState(false);
  const shown = open ?? own;
  const id = useId();
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={shown}
        aria-controls={id}
        className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        onClick={() => {
          setOwn(!shown);
          onOpenChange?.(!shown);
        }}
      >
        <ChevronRight className={cn("size-3.5 transition-transform", shown && "rotate-90")} aria-hidden />
        {label}
      </button>
      {shown ? (
        <div id={id} className="mt-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Something optional behind a switch: the fields only appear once it is on,
 * so a person who wants none of it reads one line per thing and moves on.
 */
export function Optional({
  icon,
  title,
  summary,
  on,
  onChange,
  children,
}: {
  icon: ReactNode;
  title: string;
  summary: string;
  on: boolean;
  onChange: (on: boolean) => void;
  children?: ReactNode;
}): JSX.Element {
  const id = useId();
  return (
    <div className={cn("rounded-xl border bg-card px-4 py-3 transition-colors", on && "border-primary/50")}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          <span className="block text-muted-foreground">{summary}</span>
        </span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={on}
          checked={on}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-border transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
            on && "bg-primary",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform",
              on && "translate-x-4",
            )}
          />
        </span>
      </label>
      {on && children ? <div className="mt-3 grid gap-2.5 border-t pt-3">{children}</div> : null}
    </div>
  );
}

export interface StepMeta<Name extends string> {
  name: Name;
  label: string;
}

/**
 * The row of steps along the top. A step already passed can be gone back to;
 * one not reached yet cannot be jumped to, because each one needs the last.
 */
export function Stepper<Name extends string>({
  steps,
  current,
  reached,
  onPick,
}: {
  steps: StepMeta<Name>[];
  current: Name;
  reached: number;
  onPick: (name: Name) => void;
}): JSX.Element {
  const at = steps.findIndex((step) => step.name === current);
  return (
    <ol className="flex items-center gap-1.5" aria-label="Setup steps">
      {steps.map((step, index) => {
        const done = index < at;
        const here = index === at;
        const open = index <= reached && !here;
        return (
          <li key={step.name} className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              disabled={!open}
              aria-current={here ? "step" : undefined}
              onClick={() => onPick(step.name)}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-[12px] disabled:cursor-default",
                open && "hover:bg-accent",
                here ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-4.5 shrink-0 place-items-center rounded-full text-[10px] tabular-nums",
                  done || here ? "bg-primary text-primary-foreground" : "bg-border text-foreground",
                )}
              >
                {done ? <CheckIcon className="size-3" /> : index + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </button>
            {index < steps.length - 1 ? (
              <span aria-hidden className={cn("h-px min-w-2 flex-1", done ? "bg-primary" : "bg-border")} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function Heading({ title, children }: { title: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="mb-4">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {children ? <p className="mt-1 text-muted-foreground">{children}</p> : null}
    </div>
  );
}

export function Note({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <p className={cn("mt-2 text-muted-foreground", className)}>{children}</p>;
}
