// The models step: what runs on this Mac, and the choice of how large a mind
// to give it. It draws and it collects answers; the downloading is the
// onboarding's, so it shares the one log and the one busy state with the
// install before it.

import { Scale } from "lucide-react";
import type { JSX } from "react";
import type { LayaStatus, ModelsStatus } from "@/lib/bridge";
import { cn } from "@/lib/utils";
import { Note, Optional, Row, type Tone } from "@/panels/onboarding/parts";

/** The thinking choice that downloads nothing: a model server somebody already runs. */
export const ELSEWHERE = "elsewhere";

/** The three downloads this step can start, one row each. */
export type ModelJob = "voice" | "llm" | "laya";

/** What the step would do if its button were pressed now. Empty means there is nothing left. */
export function modelWork(
  status: ModelsStatus,
  laya: LayaStatus | null,
  choice: string,
  layaOn: boolean,
  voiceDone: boolean,
): ModelJob[] {
  const work: ModelJob[] = [];
  if (!voiceDone || !status.wake.ready || !status.whisper.ready) work.push("voice");
  if (choice !== ELSEWHERE && !(status.llm.managed && status.llm.model === choice && status.llm.ready)) {
    work.push("llm");
  }
  if (layaOn && laya?.supported && !layaWired(laya)) work.push("laya");
  return work;
}

/** Everything `parlour laya setup` leaves behind is in place. */
export function layaWired(laya: LayaStatus): boolean {
  return laya.ready && laya.decision === "laya-mlx" && laya.mcp;
}

export function Models({
  status,
  laya,
  choice,
  onChoice,
  layaOn,
  onLaya,
  voiceDone,
  job,
  failed,
  disabled,
}: {
  status: ModelsStatus;
  laya: LayaStatus | null;
  choice: string;
  onChoice: (id: string) => void;
  layaOn: boolean;
  onLaya: (on: boolean) => void;
  /** Kokoro was fetched this session. Its cache is transformers.js's, so there is no asking whether it is there. */
  voiceDone: boolean;
  job: ModelJob | null;
  failed: ModelJob | null;
  disabled: boolean;
}): JSX.Element {
  const tone = (which: ModelJob, done: boolean): Tone =>
    job === which ? "busy" : failed === which ? "bad" : done ? "ok" : "todo";

  const hearing = status.wake.ready && status.whisper.ready;
  const picked = status.llm.choices.find((model) => model.id === choice);
  const thinkingDone = status.llm.managed && status.llm.model === choice && status.llm.ready;
  const wired = laya ? layaWired(laya) : false;

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        <Row
          tone={tone("voice", hearing && voiceDone)}
          name="Hearing and speaking"
          detail={
            hearing && voiceDone
              ? `The ${status.wake.word.replaceAll("_", " ")} wake word, whisper and the Kokoro voice are here.`
              : `The ${status.wake.word.replaceAll("_", " ")} wake word, whisper for speech to text, and Kokoro, the voice it answers in. A few hundred MB.`
          }
        />
        <Row
          tone={choice === ELSEWHERE ? "ok" : tone("llm", thinkingDone)}
          name="Thinking"
          detail={
            choice === ELSEWHERE
              ? "Your own model server. Its address goes in Settings, under the local model."
              : thinkingDone
                ? `${picked?.label ?? choice} is here, and Parlour runs it.`
                : `${picked?.label ?? choice}, about ${picked?.sizeGb ?? "?"} GB. Parlour runs it on this Mac and keeps it running.`
          }
        />
        {layaOn && laya?.supported ? (
          <Row
            tone={tone("laya", wired)}
            name="Quick decisions"
            detail={
              wired
                ? "laya-mlx is set up, with its tools and the skill that says when to use them."
                : "laya-mlx in a Python environment of its own, its checkpoint, its tools and a skill."
            }
          />
        ) : null}
      </ul>

      <fieldset disabled={disabled}>
        <legend className="mb-2 font-medium">Which model thinks</legend>
        <div className="grid gap-2">
          {status.llm.choices.map((model) => {
            const tooBig = model.needsGb > status.llm.memoryGb;
            return (
              <Choice
                key={model.id}
                value={model.id}
                checked={choice === model.id}
                disabled={tooBig}
                onPick={onChoice}
                title={`${model.label}, ${model.sizeGb} GB`}
                tag={
                  model.id === status.llm.suggested
                    ? "Suggested"
                    : tooBig
                      ? `Needs ${model.needsGb} GB`
                      : undefined
                }
                detail={model.note}
              />
            );
          })}
          <Choice
            value={ELSEWHERE}
            checked={choice === ELSEWHERE}
            onPick={onChoice}
            title="A model server I already run"
            detail="LM Studio, Ollama or anything that speaks the OpenAI API. Nothing is downloaded."
          />
        </div>
        <Note>
          This Mac has {status.llm.memoryGb} GB. The suggestion is the largest that leaves room for everything
          else.
        </Note>
      </fieldset>

      <Optional
        icon={<Scale />}
        title="Quick decisions with laya"
        summary={
          laya?.supported === false
            ? (laya.reason ?? "Not available on this Mac.")
            : "A small classifier on this Mac that judges, in milliseconds, whether a request needs the cloud, and gives the model tools for sorting and labelling."
        }
        on={layaOn && laya?.supported !== false}
        onChange={(on) => {
          if (!disabled && laya?.supported !== false) onLaya(on);
        }}
      >
        <p className="text-muted-foreground">
          It starts in shadow mode: the log shows what it would have decided, and nothing changes until you
          switch it to triage in Pipeline.
          {laya?.uv ? "" : " It needs uv, which is installed with Homebrew."}
        </p>
      </Optional>
    </div>
  );
}

function Choice({
  value,
  checked,
  disabled,
  onPick,
  title,
  tag,
  detail,
}: {
  value: string;
  checked: boolean;
  disabled?: boolean;
  onPick: (value: string) => void;
  title: string;
  tag?: string;
  detail: string;
}): JSX.Element {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border bg-card px-3 py-2.5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        checked && "border-primary bg-primary/10",
        disabled && "cursor-default opacity-50",
      )}
    >
      <input
        type="radio"
        name="ob-llm"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onPick(value)}
        className="sr-only"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn(checked && "font-medium")}>{title}</span>
          {tag ? (
            <span className="rounded-full bg-border px-2 py-px text-[11px] text-muted-foreground">{tag}</span>
          ) : null}
        </span>
        <span className="block text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}
