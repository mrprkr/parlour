// Every stage between a person speaking and the house answering, tried one at
// a time. The doctor says a part is installed; this says it works, which is
// the question someone setting up a new microphone is actually asking. Each
// button is one `parlour try`, so what passes here is what the agent will do.

import {
  AudioLines,
  CircleAlert,
  Cloud,
  Cpu,
  Ear,
  type LucideIcon,
  Mic,
  Play,
  Volume2,
  Wrench,
} from "lucide-react";
import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readConfig, type Stage, secretsStatus, type Trial, tryStage } from "@/lib/bridge";
import { cn } from "@/lib/utils";
import { Mark, type Tone } from "@/panels/onboarding/parts";

/** How long each listening stage records for, which is also the countdown shown. */
const SECONDS: Partial<Record<Stage, number>> = { mic: 3, wake: 10, stt: 8 };

/** A peak this loud fills the meter. Speech at a desk sits well under it. */
const FULL_SCALE = 0.25;

interface Setup {
  wake: string;
  /** Switched on and with a key to use. */
  cloud: boolean;
  stt: string;
  tts: string;
  local: string;
}

const FALLBACK: Setup = { wake: "hey jarvis", cloud: false, stt: "whisper-cpp", tts: "kokoro", local: "" };

/** A result, or the reason there is none: the CLI would not run at all. */
type Outcome = Trial | { failed: string };

type DemoStep = "wake" | "stt" | "ask" | "tts";

const DEMO: { step: DemoStep; label: string }[] = [
  { step: "wake", label: "Wake word" },
  { step: "stt", label: "Hearing" },
  { step: "ask", label: "Thinking" },
  { step: "tts", label: "Speaking" },
];

interface Demo {
  at: DemoStep | null;
  done: DemoStep[];
  failed: DemoStep | null;
  heard?: string;
  reply?: string;
  detail?: string;
}

export function PipelinePanel({
  running,
  reloadKey,
}: {
  /** Parlour itself is listening, and will hear every test too. */
  running: boolean;
  reloadKey?: number;
}): JSX.Element {
  const [setup, setSetup] = useState<Setup>(FALLBACK);
  const [results, setResults] = useState<Partial<Record<Stage, Outcome>>>({});
  const [busy, setBusy] = useState<Stage | "demo" | null>(null);
  const [left, setLeft] = useState(0);
  const [demo, setDemo] = useState<Demo | null>(null);

  const [question, setQuestion] = useState("In one short sentence, what is the capital of France?");
  const [cloudQuestion, setCloudQuestion] = useState("Why is the sky blue? One sentence.");
  const [line, setLine] = useState("Hello. This is how I will sound when I answer.");
  const [request, setRequest] = useState("What time is it?");

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // `reloadKey` says look again, after setup has changed the answers.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the trigger, not an input
  useEffect(() => {
    let live = true;
    void Promise.all([readConfig(), secretsStatus()])
      .then(([config, secrets]) => {
        if (!live) return;
        const stt = config.stt as { provider?: string } | undefined;
        setSetup({
          wake: (config.wake?.words?.[0] || "hey_jarvis").replaceAll("_", " "),
          cloud: secrets.ANTHROPIC_API_KEY && config.llm?.cloud?.enabled !== false,
          stt: stt?.provider ?? FALLBACK.stt,
          tts: (config.tts as { provider?: string } | undefined)?.provider ?? FALLBACK.tts,
          local: config.llm?.local?.model ?? "",
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [reloadKey]);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  /** Counts down while a stage has the microphone, so nobody talks into a finished recording. */
  const countdown = useCallback((seconds: number | undefined) => {
    if (timer.current) clearInterval(timer.current);
    setLeft(seconds ?? 0);
    if (!seconds) return;
    timer.current = setInterval(() => {
      setLeft((now) => {
        if (now <= 1 && timer.current) clearInterval(timer.current);
        return Math.max(0, now - 1);
      });
    }, 1000);
  }, []);

  const trial = useCallback(
    async (stage: Stage, options: { text?: string; silent?: boolean } = {}): Promise<Outcome> => {
      countdown(SECONDS[stage]);
      try {
        return await tryStage(stage, { seconds: SECONDS[stage], ...options });
      } catch (error) {
        return { failed: String(error) };
      } finally {
        countdown(0);
      }
    },
    [countdown],
  );

  async function one(stage: Stage, text?: string): Promise<void> {
    setBusy(stage);
    setResults((now) => ({ ...now, [stage]: undefined }));
    const outcome = await trial(stage, { text });
    setResults((now) => ({ ...now, [stage]: outcome }));
    setBusy(null);
  }

  /**
   * The whole round trip, one stage handing to the next, which is what the
   * house does when someone speaks to it. Stops at the first stage that does
   * not pass and says which it was.
   */
  async function endToEnd(): Promise<void> {
    setBusy("demo");
    const state: Demo = { at: "wake", done: [], failed: null };
    setDemo({ ...state });
    const step = async (name: DemoStep, run: () => Promise<Outcome>): Promise<Trial | null> => {
      state.at = name;
      setDemo({ ...state });
      const outcome = await run();
      if ("failed" in outcome || !outcome.ok) {
        state.failed = name;
        state.at = null;
        state.detail = "failed" in outcome ? outcome.failed : outcome.detail;
        setDemo({ ...state });
        return null;
      }
      state.done = [...state.done, name];
      setDemo({ ...state });
      return outcome;
    };

    try {
      if (!(await step("wake", () => trial("wake")))) return;
      const heard = await step("stt", () => trial("stt"));
      if (!heard) return;
      state.heard = heard.heard;
      const answer = await step("ask", () => trial("ask", { text: heard.heard }));
      if (!answer) return;
      state.reply = answer.reply;
      if (!(await step("tts", () => trial("tts", { text: answer.reply })))) return;
      state.at = null;
      setDemo({ ...state });
    } finally {
      setBusy(null);
    }
  }

  const idle = busy === null;
  const listening = (stage: Stage) => busy === stage && left > 0;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Everything between you speaking and Parlour answering, one stage at a time. Start at the top: each
        stage needs the one above it.
      </p>

      {running ? (
        <Alert>
          <CircleAlert />
          <AlertDescription>
            Parlour is running, so it hears these tests too and may answer them. Stop it for a quiet test.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">The whole thing</h3>
            <p className="text-muted-foreground">
              Say "{setup.wake}", pause, then ask for something. Parlour answers out loud.
            </p>
          </div>
          <Button size="sm" disabled={!idle} onClick={() => void endToEnd()}>
            <Play />
            {busy === "demo" ? "Running..." : "Try it"}
          </Button>
        </div>

        {demo ? (
          <div className="mt-3 space-y-2">
            <ol className="flex items-center gap-1.5" aria-label="Progress">
              {DEMO.map(({ step, label }, index) => {
                const tone: Tone = demo.done.includes(step)
                  ? "ok"
                  : demo.failed === step
                    ? "bad"
                    : demo.at === step
                      ? "busy"
                      : "todo";
                return (
                  <li key={step} className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span
                      className={cn(
                        "flex min-w-0 items-center gap-1 text-[12px]",
                        tone === "todo" ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      <Mark tone={tone} className="mt-0 size-3.5" />
                      <span className="truncate">{label}</span>
                    </span>
                    {index < DEMO.length - 1 ? (
                      <span aria-hidden className="h-px min-w-2 flex-1 bg-border" />
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <p className="text-muted-foreground" aria-live="polite">
              {demo.at === "wake"
                ? `Say "${setup.wake}"...${left ? ` ${left}s` : ""}`
                : demo.at === "stt"
                  ? `Now ask. It stops when you do.${left ? ` ${left}s` : ""}`
                  : demo.at === "ask"
                    ? "Working it out..."
                    : demo.at === "tts"
                      ? "Answering..."
                      : demo.failed
                        ? demo.detail
                        : "That is the whole round trip."}
            </p>
            {demo.heard ? <Said who="You">{demo.heard}</Said> : null}
            {demo.reply ? <Said who="Parlour">{demo.reply}</Said> : null}
          </div>
        ) : null}
      </section>

      <ol className="relative space-y-2.5 before:absolute before:top-4 before:bottom-4 before:left-[19px] before:w-px before:bg-border">
        <StageCard
          icon={Mic}
          title="Microphone"
          what="Records three seconds and measures how loud it was. Talk normally."
          outcome={results.mic}
          busy={busy === "mic"}
          disabled={!idle}
          action={listening("mic") ? `Listening ${left}s` : "Record"}
          onTry={() => void one("mic")}
        />
        <StageCard
          icon={Ear}
          title="Wake word"
          what={`Listens for ten seconds for "${setup.wake}".`}
          outcome={results.wake}
          busy={busy === "wake"}
          disabled={!idle}
          action={listening("wake") ? `Say it: ${left}s` : "Listen"}
          onTry={() => void one("wake")}
        />
        <StageCard
          icon={AudioLines}
          title="Transcription"
          what={`Say a sentence and ${setup.stt} writes down what it heard.`}
          outcome={results.stt}
          busy={busy === "stt"}
          disabled={!idle}
          action={listening("stt") ? `Speak: ${left}s` : "Listen"}
          onTry={() => void one("stt")}
        />
        <StageCard
          icon={Cpu}
          title="Local model"
          what={`Answers on this Mac${setup.local ? ` with ${setup.local}` : ""}. No tools, just the model.`}
          outcome={results.llm}
          busy={busy === "llm"}
          disabled={!idle || !question.trim()}
          action="Ask"
          onTry={() => void one("llm", question)}
        >
          <Input
            aria-label="Question for the local model"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </StageCard>
        <StageCard
          icon={Cloud}
          title="Cloud help"
          what={
            setup.cloud
              ? "What the local model hands on when a question is beyond it."
              : "Switched off, or no Anthropic key. Turn it on in setup or Settings."
          }
          outcome={results.cloud}
          busy={busy === "cloud"}
          disabled={!idle || !setup.cloud || !cloudQuestion.trim()}
          action="Ask"
          onTry={() => void one("cloud", cloudQuestion)}
        >
          {setup.cloud ? (
            <Input
              aria-label="Question for the cloud model"
              value={cloudQuestion}
              onChange={(event) => setCloudQuestion(event.target.value)}
            />
          ) : null}
        </StageCard>
        <StageCard
          icon={Volume2}
          title="Voice"
          what={`Speaks through this Mac's speaker with ${setup.tts}.`}
          outcome={results.tts}
          busy={busy === "tts"}
          disabled={!idle || !line.trim()}
          action="Speak"
          onTry={() => void one("tts", line)}
        >
          <Input
            aria-label="Something to say"
            value={line}
            onChange={(event) => setLine(event.target.value)}
          />
        </StageCard>
        <StageCard
          icon={Wrench}
          title="Tools and answer"
          what="The request as the house would take it, with every tool. It really acts: ask for the lights and they come on."
          outcome={results.ask}
          busy={busy === "ask"}
          disabled={!idle || !request.trim()}
          action="Ask"
          onTry={() => void one("ask", request)}
        >
          <Input
            aria-label="A request"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
          />
        </StageCard>
      </ol>
    </div>
  );
}

function StageCard({
  icon: Icon,
  title,
  what,
  outcome,
  busy,
  disabled,
  action,
  onTry,
  children,
}: {
  icon: LucideIcon;
  title: string;
  what: string;
  outcome: Outcome | undefined;
  busy: boolean;
  disabled: boolean;
  action: string;
  onTry: () => void;
  children?: ReactNode;
}): JSX.Element {
  const passed = outcome && !("failed" in outcome) && outcome.ok;
  const failed = outcome && ("failed" in outcome || !outcome.ok);
  return (
    <li className="relative flex gap-3">
      <span
        className={cn(
          "z-[1] grid size-10 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground",
          passed && "border-primary text-primary",
          failed && "border-destructive text-destructive",
          busy && "border-primary text-primary",
        )}
      >
        <Icon className={cn("size-4", busy && "animate-pulse")} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 rounded-xl border bg-card px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-medium">{title}</h3>
            <p className="text-muted-foreground">{what}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onTry}
            className="shrink-0 tabular-nums"
          >
            {busy ? <Mark tone="busy" className="mt-0" /> : null}
            {action}
          </Button>
        </div>
        {children ? <div className="mt-2.5">{children}</div> : null}
        {outcome ? <Result outcome={outcome} /> : null}
      </div>
    </li>
  );
}

function Result({ outcome }: { outcome: Outcome }): JSX.Element {
  if ("failed" in outcome) {
    return (
      <p className="mt-2.5 flex gap-2 text-destructive" role="alert">
        <Mark tone="bad" />
        {outcome.failed}
      </p>
    );
  }
  return (
    <div className="mt-2.5 space-y-1.5 border-t pt-2.5" aria-live="polite">
      <p className="flex gap-2">
        <Mark tone={outcome.ok ? "ok" : "bad"} />
        <span className={cn(!outcome.ok && "text-destructive")}>{outcome.detail}</span>
      </p>
      {outcome.level ? <Meter peak={outcome.level.peak} /> : null}
      {outcome.heard && outcome.stage !== "wake" ? <Said who="Heard">{outcome.heard}</Said> : null}
      {outcome.reply && outcome.stage !== "tts" ? <Said who="Reply">{outcome.reply}</Said> : null}
      {outcome.ms ? (
        <p className="text-[12px] text-muted-foreground tabular-nums">
          {outcome.ms < 1000 ? `${outcome.ms} ms` : `${(outcome.ms / 1000).toFixed(1)} s`}
          {outcome.via ? `, ${outcome.via}` : ""}
        </p>
      ) : null}
    </div>
  );
}

/** How loud the loudest moment was, so "too quiet" is something to see rather than guess. */
function Meter({ peak }: { peak: number }): JSX.Element {
  const share = Math.min(1, peak / FULL_SCALE);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-muted-foreground">
        Level<span className="sr-only">: {Math.round(share * 100)} percent</span>
      </span>
      <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </span>
    </div>
  );
}

function Said({ who, children }: { who: string; children: ReactNode }): JSX.Element {
  return (
    <p className="rounded-lg bg-muted px-2.5 py-1.5">
      <span className="text-[12px] text-muted-foreground">{who} </span>"{children}"
    </p>
  );
}
