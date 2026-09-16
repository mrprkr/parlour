// The first run. Everything here writes through the same commands the Settings
// tab uses, and the installing is the agent's own scripts/setup.sh, so nothing
// in this file is a second way of doing something.

import { Check as CheckIcon, TriangleAlert, X } from "lucide-react";
import { type JSX, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type AgentConfig,
  audioDevices,
  type Check,
  deviceValue,
  microphoneCheck,
  mintToken,
  onSetupEvent,
  openPrivacySettings,
  type Readiness,
  readAgentConfig,
  runDoctor,
  runSetup,
  type SecretEdit,
  type SecretsPresent,
  type SetupEvent,
  secretsPresent,
  setSettings,
  setupStatus,
  startAgent,
  writeAgentConfig,
  writeSecrets,
} from "@/lib/bridge";
import { cn } from "@/lib/utils";

const HA_DEFAULT = "http://homeassistant.home:8123";
const WAKE_DEFAULT = "hey_jarvis";
const DEVICE_DEFAULT = ":0";

const WAKE_WORDS: { value: string; label: string }[] = [
  { value: "hey_jarvis", label: "hey jarvis" },
  { value: "alexa", label: "alexa" },
  { value: "hey_mycroft", label: "hey mycroft" },
];

/**
 * scripts/setup.sh reports what it is doing rather than printing a transcript,
 * so the log has to draw the shape back on: a blank line opens a step, and its
 * results sit indented underneath it.
 */
const PREFIX: Partial<Record<SetupEvent["kind"], string>> = {
  step: "\n",
  fail: "  ✗ ",
  warn: "  ! ",
  ok: "  ✓ ",
  done: "\n",
};

type Tone = "ok" | "warn" | "bad";

function Mark({ tone }: { tone: Tone }): JSX.Element {
  const Icon = tone === "ok" ? CheckIcon : tone === "bad" ? X : TriangleAlert;
  return (
    <Icon
      aria-hidden
      className={cn(
        "mt-0.5 size-4 shrink-0",
        tone === "ok" && "text-primary",
        tone === "warn" && "text-warn",
        tone === "bad" && "text-destructive",
      )}
    />
  );
}

function CheckRow({ tone, name, detail }: { tone: Tone; name: string; detail: string }): JSX.Element {
  return (
    <li className="grid grid-cols-[1rem_8rem_1fr] items-start gap-2.5 rounded-lg border bg-card px-3 py-2">
      <Mark tone={tone} />
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground">{detail}</span>
    </li>
  );
}

function Note({ children }: { children: ReactNode }): JSX.Element {
  return <p className="mt-2 text-muted-foreground">{children}</p>;
}

function Step({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <li className="rounded-xl border bg-card px-4 py-4">
      <h2 className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold">
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full text-[11px] tabular-nums",
            done ? "bg-primary text-primary-foreground" : "bg-border text-foreground",
          )}
        >
          {done ? <CheckIcon className="size-3" /> : index}
        </span>
        {title}
      </h2>
      {children}
    </li>
  );
}

/** The sentence under step one, which is the whole diagnosis of a wrong path. */
function whereNote(readiness: Readiness): string {
  if (readiness.agentDirOk) {
    if (readiness.nodeOk) return `Found the agent, and node ${readiness.nodeVersion}.`;
    if (readiness.nodeVersion) {
      return `node ${readiness.nodeVersion} is too old. The agent needs 22 or newer to run TypeScript without a build step.`;
    }
    return "That node did not answer. Point it at one, or install step 2 will find one for you.";
  }
  return readiness.candidates.length
    ? "That is not an agent directory. Pick one of the suggestions."
    : "No agent checkout found. Clone the home-assistant repository and give the path to its agent directory.";
}

export function Onboarding({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}): JSX.Element | null {
  /** Opened by itself because there is something still to do, rather than asked for. */
  const [selfOpen, setSelfOpen] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [present, setPresent] = useState<SecretsPresent | null>(null);

  const [dir, setDir] = useState("");
  const [node, setNode] = useState("");

  const [haUrl, setHaUrl] = useState(HA_DEFAULT);
  const [haToken, setHaToken] = useState("");
  const [anthropic, setAnthropic] = useState("");
  const [wake, setWake] = useState(WAKE_DEFAULT);
  const [mic, setMic] = useState(DEVICE_DEFAULT);
  const [mics, setMics] = useState<{ value: string; label: string }[]>([]);
  const [network, setNetwork] = useState(false);
  const [saveNote, setSaveNote] = useState("");

  const [installing, setInstalling] = useState(false);
  const [runNote, setRunNote] = useState("");
  const [log, setLog] = useState("");
  const [logShown, setLogShown] = useState(false);

  const [checks, setChecks] = useState<Check[]>([]);
  const [doctorNote, setDoctorNote] = useState<string | null>("Not checked yet.");

  const [asking, setAsking] = useState(false);
  const [micAsked, setMicAsked] = useState(false);
  const [micDetail, setMicDetail] = useState("Not asked for yet.");
  /** Undefined until it has been asked, because asking is what shows the prompt. */
  const [micGranted, setMicGranted] = useState<boolean | undefined>(undefined);

  // Read inside callbacks that must not be rebuilt when the answer changes.
  const micGrantedRef = useRef<boolean | undefined>(undefined);
  const askingRef = useRef(false);
  /** A microphone chosen while an ask was still up, waiting its turn. */
  const queuedRef = useRef<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const atBottomRef = useRef(true);
  const startedRef = useRef(false);
  const wasOpenRef = useRef(open);
  const dirRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLInputElement>(null);

  /** Drawn instead of the diagnosis when the Rust side would not answer at all. */
  const [whereError, setWhereError] = useState<string | null>(null);

  const visible = open || selfOpen;

  /** Whether .env already carries a network token, which decides whether to mint one. */
  const hasAgentToken = present?.agentToken ?? false;

  const ask = useCallback(async (device: string) => {
    // Two of these at once would stack two system dialogs, so a microphone
    // chosen mid-ask waits for the answer to the one already up rather than
    // being dropped, which would leave the note describing the old device.
    if (askingRef.current) {
      queuedRef.current = device;
      return;
    }
    askingRef.current = true;
    setAsking(true);
    setMicAsked(false);
    setMicDetail("Asking. Answer the prompt macOS puts up.");
    try {
      const result = await microphoneCheck(device);
      micGrantedRef.current = result.granted;
      setMicGranted(result.granted);
      setMicDetail(result.detail);
    } catch (error) {
      micGrantedRef.current = false;
      setMicGranted(false);
      setMicDetail(String(error));
    } finally {
      setMicAsked(true);
      askingRef.current = false;
      setAsking(false);
      const queued = queuedRef.current;
      queuedRef.current = null;
      if (queued !== null) void ask(queued);
    }
  }, []);

  /** Fills the answers from whatever is already configured, and says which microphone. */
  const loadAnswers = useCallback(async (): Promise<string> => {
    let config: AgentConfig = {};
    try {
      config = JSON.parse(await readAgentConfig()) as AgentConfig;
    } catch {
      // No config yet is the normal first run state.
    }

    setHaUrl(config.homeAssistant?.baseUrl ?? HA_DEFAULT);
    // An empty wake word is not a wake word: an older window wrote one when it
    // was shown a word it did not offer, and a list cannot show it back.
    setWake(config.wake?.words?.[0] || WAKE_DEFAULT);

    const secrets = await secretsPresent();
    setPresent(secrets);
    setNetwork(secrets.agentToken);

    const current = config.audio?.inputDevice || DEVICE_DEFAULT;
    let devices: string[] = [];
    try {
      devices = await audioDevices();
    } catch {
      // ffmpeg is what lists them, and it may not be installed yet.
    }

    const options = devices.map((device) => ({ value: deviceValue(device, current), label: device }));
    if (!options.some((option) => option.value === current)) {
      options.unshift({ value: current, label: `${current}, the default microphone` });
    }
    // Two unnumbered devices fall back to the same value, and a list holding
    // one value twice cannot say which of them was chosen.
    const seen = new Set<string>();
    setMics(
      options.filter((option) => {
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
      }),
    );
    setMic(current);
    return current;
  }, []);

  /** Asks the Rust side what is in place, and redraws around the answer. */
  const refresh = useCallback(async (): Promise<Readiness> => {
    const next = await setupStatus();
    setReadiness(next);
    setDir(next.agentDir ?? "");
    setNode(next.nodePath ?? "");

    const device = await loadAnswers();

    // Nobody should have to know to press a button for this. ffmpeg is what
    // opens the device, so there is nothing to ask with until it is installed,
    // and after the first yes this is a silent quarter of a second. It is not
    // awaited: the system prompt stays up until a person answers it.
    if (next.ffmpeg && micGrantedRef.current === undefined) void ask(device);

    return next;
  }, [ask, loadAnswers]);

  useEffect(() => {
    // Guarded because a second run would ask for the microphone twice.
    if (startedRef.current) return;
    startedRef.current = true;
    void refresh()
      .then((next) => {
        // Opens itself when there is something still to do, which on a fresh
        // machine is everything.
        if (!next.installed) setSelfOpen(true);
      })
      // Nothing here draws without an answer, and a packaged app has no console
      // to find out why in, so the failure goes where the diagnosis would.
      .catch((error: unknown) => setWhereError(String(error)));
  }, [refresh]);

  useEffect(() => {
    // Asked for from Settings, so catch up on what has changed since.
    if (open && !wasOpenRef.current) {
      void refresh().catch((error: unknown) => setWhereError(String(error)));
    }
    wasOpenRef.current = open;
  }, [open, refresh]);

  useEffect(() => {
    const pending = onSetupEvent((event) => {
      const element = logRef.current;
      atBottomRef.current = !element || element.scrollTop + element.clientHeight >= element.scrollHeight - 20;
      setLog((previous) => `${previous}${PREFIX[event.kind] ?? "    "}${event.text}\n`);
      if (event.kind === "step") setRunNote(event.text);
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);

  useLayoutEffect(() => {
    // Only follow the tail while the reader is already at it.
    const element = logRef.current;
    if (element && atBottomRef.current) element.scrollTop = element.scrollHeight;
  }, [log]);

  const dismiss = useCallback(() => {
    setSelfOpen(false);
    onClose();
  }, [onClose]);

  // ---------------------------------------------------------------- step one

  // Retyping a path should say straight away whether it was the right one, and
  // picking one of the suggestions should say so the moment it is picked. Both
  // are the native change event, which React does not surface: its onChange is
  // the input event, and that fires on every keystroke.
  useEffect(() => {
    const boxes = [dirRef.current, nodeRef.current];

    const commit = () => {
      // The boxes are read rather than the state this listener closed over,
      // since it outlives the render that installed it.
      void setSettings({
        agentDir: dirRef.current?.value.trim() ?? "",
        nodePath: nodeRef.current?.value.trim() ?? "",
      })
        .then(() => refresh())
        .then(() => setWhereError(null))
        .catch((error: unknown) => setWhereError(String(error)));
    };

    for (const box of boxes) box?.addEventListener("change", commit);
    return () => {
      for (const box of boxes) box?.removeEventListener("change", commit);
    };
  }, [refresh, visible]);

  // ---------------------------------------------------------------- step two

  const install = async () => {
    setInstalling(true);
    setLog("");
    setLogShown(true);
    setRunNote("Working. The models are a few hundred megabytes, so this takes a while.");
    try {
      await setSettings({ agentDir: dir.trim(), nodePath: node.trim() });
      const ok = await runSetup(wake);
      setRunNote(ok ? "Done." : "Finished, with the failures above still to fix.");
    } catch (error) {
      setRunNote(String(error));
    } finally {
      setInstalling(false);
      // In the finally so it runs either way, and caught so that a Rust side
      // that has stopped answering does not throw past the note above.
      await refresh().catch((error: unknown) => setRunNote(String(error)));
    }
  };

  // -------------------------------------------------------------- step three

  /** null leaves it alone, "" takes it away, anything else is a new one. */
  const agentToken = (): SecretEdit => {
    if (!network) return hasAgentToken ? "" : null;
    // Minting a second one would lock out every phone and satellite already
    // holding the first.
    if (hasAgentToken) return null;
    return mintToken();
  };

  const save = async () => {
    try {
      const config = JSON.parse(await readAgentConfig()) as AgentConfig;
      config.homeAssistant ??= {};
      config.audio ??= {};
      config.wake ??= {};
      config.llm ??= {};
      config.llm.cloud ??= {};

      config.homeAssistant.baseUrl = haUrl.trim();
      config.audio.inputDevice = mic;
      config.wake.words = [wake];
      // Nothing to escalate to without a key, and a cloud model that cannot be
      // reached is a slow way to fail.
      if (anthropic) config.llm.cloud.enabled = true;

      await writeAgentConfig(config);
      await writeSecrets({
        haToken: haToken || null,
        anthropicKey: anthropic || null,
        braveKey: null,
        // Ticking the box mints a token once. Unticking it takes the house back
        // off the network.
        agentToken: agentToken(),
      });

      setHaToken("");
      setAnthropic("");
      setSaveNote("Saved.");
      onSaved();
      await refresh();
    } catch (error) {
      setSaveNote(String(error));
    }
  };

  // --------------------------------------------------------------- step four

  const doctor = async () => {
    setChecks([]);
    setDoctorNote("Checking...");
    try {
      const result = await runDoctor();
      setChecks(result);
      setDoctorNote(null);
    } catch (error) {
      setChecks([]);
      setDoctorNote(`Could not run the check: ${error}`);
    }
  };

  const start = async () => {
    try {
      await startAgent();
      dismiss();
    } catch (error) {
      // A house that will not start is a thing to read, not to throw.
      setChecks([]);
      setDoctorNote(String(error));
    }
  };

  // ------------------------------------------------------------------ render

  if (!visible) return null;

  // A wake word written into the config by hand is still the wake word, so it
  // joins the list rather than leaving the control looking empty.
  const wakeWords = WAKE_WORDS.some((word) => word.value === wake)
    ? WAKE_WORDS
    : [{ value: wake, label: `${wake} (from the config)` }, ...WAKE_WORDS];

  const micTone: Tone = asking ? "warn" : micGranted ? "ok" : micAsked ? "bad" : "warn";
  const rows: [string, boolean, string][] = readiness
    ? [
        ["Agent", readiness.agentDirOk, readiness.agentDir || "not set"],
        ["Node", readiness.nodeOk, readiness.nodeVersion ?? "not found"],
        [
          "Homebrew",
          readiness.homebrew,
          readiness.homebrew ? "installed" : "not installed, so nothing can be installed for you",
        ],
        ["Packages", readiness.packages, readiness.packages ? "installed" : "not installed yet"],
        ["Models", readiness.models, readiness.models ? "downloaded" : "about 500 MB, downloaded once"],
        ["ffmpeg", readiness.ffmpeg, readiness.ffmpeg ? "installed" : "no ffmpeg means no microphone"],
        ["whisper", readiness.whisper, readiness.whisper ? "installed" : "no speech to text without it"],
        ["Config", readiness.config, readiness.config ? "agent.config.json" : "written by the install below"],
      ]
    : [];

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto bg-background p-5">
      <div className="mx-auto max-w-[640px]">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-[17px] font-semibold">Setting up the house agent</h1>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Close
          </Button>
        </div>
        <p className="text-muted-foreground">
          Four steps. It remembers where it got to, so this can be closed and come back to.
        </p>

        <ol className="mt-4 grid gap-3.5">
          <Step
            index={1}
            title="Where the agent lives"
            done={Boolean(readiness?.agentDirOk && readiness.nodeOk)}
          >
            <p className="text-muted-foreground">
              The <code className="font-mono">agent</code> directory inside your Home Assistant checkout, and
              the node that runs it.
            </p>

            <div className="mt-2.5 grid gap-2.5">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="ob-dir">
                  Agent directory
                </Label>
                <Input
                  ref={dirRef}
                  id="ob-dir"
                  list="ob-candidates"
                  spellCheck={false}
                  placeholder="~/Developer/home-assistant/agent"
                  value={dir}
                  onChange={(event) => setDir(event.target.value)}
                />
                <datalist id="ob-candidates">
                  {(readiness?.candidates ?? []).map((candidate) => (
                    <option key={candidate} value={candidate} />
                  ))}
                </datalist>
              </div>

              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="ob-node">
                  Node
                </Label>
                <Input
                  ref={nodeRef}
                  id="ob-node"
                  spellCheck={false}
                  value={node}
                  onChange={(event) => setNode(event.target.value)}
                />
              </div>
            </div>

            {whereError !== null ? (
              <Note>{whereError}</Note>
            ) : readiness ? (
              <Note>{whereNote(readiness)}</Note>
            ) : null}
          </Step>

          <Step index={2} title="What is missing" done={Boolean(readiness?.installed)}>
            <ul className="grid gap-1.5">
              {readiness ? (
                rows.map(([name, ok, detail]) => (
                  <CheckRow key={name} tone={ok ? "ok" : "warn"} name={name} detail={detail} />
                ))
              ) : (
                <li className="text-muted-foreground">Looking...</li>
              )}
            </ul>

            <div className="mt-2.5 flex items-center gap-2.5">
              <Button disabled={installing} onClick={() => void install()}>
                Install what is missing
              </Button>
              <span className="text-muted-foreground">{runNote}</span>
            </div>

            {logShown ? (
              <pre
                ref={logRef}
                className="mt-2 max-h-[190px] overflow-y-auto rounded-lg border bg-background px-3 py-2.5 font-mono text-[11px] leading-normal break-words whitespace-pre-wrap"
              >
                {log}
              </pre>
            ) : null}
          </Step>

          <Step
            index={3}
            title="The things it cannot work out"
            done={Boolean(present?.haToken) && micGranted === true}
          >
            <div className="grid gap-2.5">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="ob-ha-url">
                  Home Assistant
                </Label>
                <Input
                  id="ob-ha-url"
                  spellCheck={false}
                  placeholder={HA_DEFAULT}
                  value={haUrl}
                  onChange={(event) => setHaUrl(event.target.value)}
                />
              </div>

              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="ob-ha-token">
                  Home Assistant token
                </Label>
                <Input
                  id="ob-ha-token"
                  type="password"
                  autoComplete="off"
                  placeholder={present?.haToken ? "set, leave blank to keep" : "not set"}
                  value={haToken}
                  onChange={(event) => setHaToken(event.target.value)}
                />
              </div>
            </div>

            <Note>
              Your profile page in Home Assistant, Security tab, right at the bottom. It is the whole house,
              so it goes in .env and never into git.
            </Note>

            <div className="mt-2.5 grid gap-1">
              <Label className="text-xs text-muted-foreground" htmlFor="ob-anthropic">
                Anthropic key, for the questions the local model hands over
              </Label>
              <Input
                id="ob-anthropic"
                type="password"
                autoComplete="off"
                placeholder={present?.anthropicKey ? "set, leave blank to keep" : "not set"}
                value={anthropic}
                onChange={(event) => setAnthropic(event.target.value)}
              />
            </div>

            <div className="mt-2.5 grid gap-1">
              <Label className="text-xs text-muted-foreground" htmlFor="ob-wake">
                Wake word
              </Label>
              <Select value={wake} onValueChange={setWake}>
                <SelectTrigger id="ob-wake" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {wakeWords.map((word) => (
                    <SelectItem key={word.value} value={word.value}>
                      {word.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-2.5 grid gap-1">
              <Label className="text-xs text-muted-foreground" htmlFor="ob-mic">
                Microphone
              </Label>
              <Select
                value={mic}
                onValueChange={(value) => {
                  setMic(value);
                  // A different microphone is a different question only in so far
                  // as the device has to open; the permission itself is the app's.
                  void ask(value);
                }}
              >
                <SelectTrigger id="ob-mic" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mics.map((option, index) => (
                    <SelectItem key={`${option.value}-${index}`} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ul className="mt-2.5 grid gap-1.5">
              <CheckRow tone={micTone} name="Permission" detail={micDetail} />
            </ul>

            <div className="mt-2.5 flex items-center gap-2.5">
              <Button variant="ghost" size="sm" disabled={asking} onClick={() => void ask(mic)}>
                Ask again
              </Button>
              {micAsked && !asking && micGranted !== true ? (
                <Button variant="ghost" size="sm" onClick={() => void openPrivacySettings()}>
                  Open System Settings
                </Button>
              ) : null}
            </div>

            <Note>
              macOS asks once, for this app, and it is asked as soon as this page can ask it. The agent hears
              through this app, so a no here is silence later.
            </Note>

            <div className="mt-2.5 flex items-center gap-2">
              <Checkbox
                id="ob-network"
                checked={network}
                onCheckedChange={(state) => setNetwork(state === true)}
              />
              <Label htmlFor="ob-network">Let the rest of the house in</Label>
            </div>

            <Note>
              Phones, satellites and Home Assistant all send one shared token. Without it the agent answers
              this machine only.
            </Note>

            <div className="mt-2.5 flex items-center gap-2.5">
              <Button onClick={() => void save()}>Save</Button>
              <span className="text-muted-foreground">{saveNote}</span>
            </div>
          </Step>

          <Step index={4} title="Check it over" done={false}>
            <ul className="grid gap-1.5">
              {doctorNote ? (
                <li className="text-muted-foreground">{doctorNote}</li>
              ) : (
                checks.map((check) => (
                  <CheckRow
                    key={check.name}
                    tone={check.ok ? "ok" : check.required ? "bad" : "warn"}
                    name={check.name}
                    detail={check.detail}
                  />
                ))
              )}
            </ul>

            <div className="mt-2.5 flex items-center gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => void doctor()}>
                Check
              </Button>
              <Button onClick={() => void start()}>Start listening</Button>
            </div>
          </Step>
        </ol>
      </div>
    </div>
  );
}
