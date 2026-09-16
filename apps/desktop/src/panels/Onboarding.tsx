// The first run. Everything here writes through the same CLI the Settings tab
// uses, and the installing is Parlour's own `init`, so nothing in this file is
// a second way of doing something.

import { Check as CheckIcon, TriangleAlert, X } from "lucide-react";
import { type JSX, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  audioDevices,
  type Check,
  deviceValue,
  getSettings,
  installCli,
  microphoneCheck,
  mintToken,
  onSetupEvent,
  openPrivacySettings,
  type Readiness,
  readConfig,
  runDoctor,
  runSetup,
  type SecretsStatus,
  type SetupEvent,
  secretsStatus,
  setSecret,
  setSettings,
  setupStatus,
  startAgent,
  writeConfig,
} from "@/lib/bridge";
import { cn } from "@/lib/utils";

const HA_DEFAULT = "http://homeassistant.local:8123";
const WAKE_DEFAULT = "hey_jarvis";
const DEVICE_DEFAULT = ":0";

const WAKE_WORDS: { value: string; label: string }[] = [
  { value: "hey_jarvis", label: "hey jarvis" },
  { value: "alexa", label: "alexa" },
  { value: "hey_mycroft", label: "hey mycroft" },
];

/**
 * `parlour init --porcelain` reports what it is doing rather than printing a
 * transcript, so the log has to draw the shape back on: a blank line opens a
 * step, and its results sit indented underneath it.
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

/** The doctor's three states as the marks this page draws. */
function toneOf(status: Check["status"]): Tone {
  return status === "ok" ? "ok" : status === "fail" ? "bad" : "warn";
}

/** The sentence under step one, which is the whole diagnosis of a missing piece. */
function whereNote(readiness: Readiness): string {
  if (readiness.parlourOk) {
    if (readiness.nodeOk)
      return `Found parlour ${readiness.parlourVersion}, and node ${readiness.nodeVersion}.`;
    if (readiness.nodeVersion) {
      return `Found parlour, but node ${readiness.nodeVersion} is too old. It needs 22 or newer.`;
    }
    return "Found parlour, but no node answered. It needs node 22 or newer on the PATH.";
  }
  if (readiness.nodeOk) {
    return readiness.parlourBin
      ? "That does not run. Install Parlour below, or give the path to a copy that does."
      : "No parlour found. Install it below, or give the path to one.";
  }
  // A node that answered but is too old is a different fix from no node at all.
  if (readiness.nodeVersion) {
    return `Found node ${readiness.nodeVersion}, but it is too old. It needs 22 or newer before Parlour can be installed below.`;
  }
  return "No node found. Install Node 22 or newer first, with brew install node, then install Parlour below.";
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
  const [present, setPresent] = useState<SecretsStatus | null>(null);

  const [bin, setBin] = useState("");
  const [installingCli, setInstallingCli] = useState(false);
  const [cliNote, setCliNote] = useState("");

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
  /** Which step's job the log is showing, or none yet. Both jobs report the same way. */
  const [logUnder, setLogUnder] = useState<1 | 2 | null>(null);

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
  const binRef = useRef<HTMLInputElement>(null);

  /** Drawn instead of the diagnosis when the Rust side would not answer at all. */
  const [whereError, setWhereError] = useState<string | null>(null);

  const visible = open || selfOpen;

  /** Whether a network token is already set, which decides whether to mint one. */
  const hasToken = present?.PARLOUR_TOKEN ?? false;

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

  /**
   * Fills the answers from whatever is already configured, and says which
   * microphone. Everything comes through the CLI, so with no parlour yet the
   * answers stay at their defaults, which is the normal first run state.
   */
  const loadAnswers = useCallback(async (parlourOk: boolean): Promise<string> => {
    let current = DEVICE_DEFAULT;
    if (parlourOk) {
      try {
        const config = await readConfig();
        setHaUrl(config.integrations?.["home-assistant"]?.url ?? HA_DEFAULT);
        // An empty wake word is not a wake word: an older window wrote one
        // when it was shown a word it did not offer, and a list cannot show it back.
        setWake(config.wake?.words?.[0] || WAKE_DEFAULT);
        current = config.audio?.inputDevice || DEVICE_DEFAULT;

        const secrets = await secretsStatus();
        setPresent(secrets);
        setNetwork(secrets.PARLOUR_TOKEN);
      } catch {
        // A CLI that will not answer is reported under step one, not here.
      }
    }

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
    setBin(next.parlourBin ?? "");

    const device = await loadAnswers(next.parlourOk);

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
      // Only the install has steps worth naming; npm is one job from start to end.
      if (event.kind === "step") setRunNote(event.text);
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);

  // `log` is the trigger, not an input: a new line is what moves the view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: log is the trigger, not an input
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

  // Retyping a path should say straight away whether it was the right one.
  // That is the native change event, which React does not surface: its
  // onChange is the input event, and that fires on every keystroke. The box
  // only exists while the page is showing, so the listener is put back when
  // it appears, which is what `visible` is doing in the list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: visible is when the box mounts
  useEffect(() => {
    const box = binRef.current;
    if (!box) return;

    const commit = () => {
      // The box is read rather than the state this listener closed over,
      // since it outlives the render that installed it. The other setting is
      // read back first so that changing the path cannot reset it.
      void getSettings()
        .then((current) => setSettings({ ...current, parlourBin: box.value.trim() }))
        .then(() => refresh())
        .then(() => setWhereError(null))
        .catch((error: unknown) => setWhereError(String(error)));
    };

    box.addEventListener("change", commit);
    return () => box.removeEventListener("change", commit);
  }, [refresh, visible]);

  const installParlour = async () => {
    setInstallingCli(true);
    setLog("");
    setLogUnder(1);
    setCliNote("Installing with npm.");
    try {
      const ok = await installCli();
      setCliNote(ok ? "Installed." : "npm did not finish. The log says why.");
    } catch (error) {
      setCliNote(String(error));
    } finally {
      setInstallingCli(false);
      // In the finally so it runs either way, and caught so that a Rust side
      // that has stopped answering does not throw past the note above.
      await refresh().catch((error: unknown) => setWhereError(String(error)));
    }
  };

  // ---------------------------------------------------------------- step two

  const install = async () => {
    setInstalling(true);
    setLog("");
    setLogUnder(2);
    setRunNote("Working. The models are a few hundred megabytes, so this takes a while.");
    try {
      const ok = await runSetup(true);
      setRunNote(ok ? "Done." : "Finished, with the failures above still to fix.");
    } catch (error) {
      setRunNote(String(error));
    } finally {
      setInstalling(false);
      await refresh().catch((error: unknown) => setRunNote(String(error)));
    }
  };

  // -------------------------------------------------------------- step three

  const save = async () => {
    try {
      const config = await readConfig();
      config.integrations ??= {};
      config.integrations["home-assistant"] ??= {};
      config.audio ??= {};
      config.wake ??= {};
      config.llm ??= {};
      config.llm.cloud ??= {};

      // A cleared box means "not set", not the empty string: `config write`
      // would accept "" and the house would then be asked for at no address.
      // Leaving the key out lets the integration's own default apply.
      const url = haUrl.trim();
      if (url) config.integrations["home-assistant"].url = url;
      else delete config.integrations["home-assistant"].url;
      config.audio.inputDevice = mic;
      config.wake.words = [wake];
      // Nothing to escalate to without a key, and a cloud model that cannot be
      // reached is a slow way to fail.
      if (anthropic) config.llm.cloud.enabled = true;

      await writeConfig(config);
      if (haToken) await setSecret("HA_TOKEN", haToken);
      if (anthropic) await setSecret("ANTHROPIC_API_KEY", anthropic);
      // Ticking the box mints a token once: a second one would lock out every
      // phone and satellite already holding the first. Unticking it takes the
      // house back off the network.
      if (network && !hasToken) await setSecret("PARLOUR_TOKEN", mintToken());
      if (!network && hasToken) await setSecret("PARLOUR_TOKEN", "");

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
  const busy = installing || installingCli;
  const logBox = (
    <pre
      ref={logRef}
      className="mt-2 max-h-[190px] overflow-y-auto rounded-lg border bg-background px-3 py-2.5 font-mono text-[11px] leading-normal break-words whitespace-pre-wrap"
    >
      {log}
    </pre>
  );
  const rows: [string, boolean, string][] = readiness
    ? [
        ["Parlour", readiness.parlourOk, readiness.parlourVersion ?? "not installed"],
        ["Node", readiness.nodeOk, readiness.nodeVersion ?? "not found"],
        ["ffmpeg", readiness.ffmpeg, readiness.ffmpeg ? "installed" : "no ffmpeg means no microphone"],
        ["Config", readiness.config, readiness.config ? "written" : "written by the install below"],
      ]
    : [];

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto bg-background p-5">
      <div className="mx-auto max-w-[640px]">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-[17px] font-semibold">Setting up Parlour</h1>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Close
          </Button>
        </div>
        <p className="text-muted-foreground">
          Four steps. It remembers where it got to, so this can be closed and come back to.
        </p>

        <ol className="mt-4 grid gap-3.5">
          <Step index={1} title="Parlour" done={Boolean(readiness?.parlourOk && readiness.nodeOk)}>
            <p className="text-muted-foreground">
              The <code className="font-mono">parlour</code> command, which this app starts and asks questions
              of. It is an npm package, so it needs node 22 or newer.
            </p>

            <div className="mt-2.5 grid gap-1">
              <Label className="text-xs text-muted-foreground" htmlFor="ob-bin">
                Where it is
              </Label>
              <Input
                ref={binRef}
                id="ob-bin"
                spellCheck={false}
                placeholder="/opt/homebrew/bin/parlour"
                value={bin}
                onChange={(event) => setBin(event.target.value)}
              />
            </div>

            {whereError !== null ? (
              <Note>{whereError}</Note>
            ) : readiness ? (
              <Note>{whereNote(readiness)}</Note>
            ) : null}

            {readiness && !readiness.parlourOk ? (
              <div className="mt-2.5 flex items-center gap-2.5">
                <Button disabled={busy || !readiness.nodeOk} onClick={() => void installParlour()}>
                  Install Parlour
                </Button>
                <span className="text-muted-foreground">{cliNote || "npm install -g parlour"}</span>
              </div>
            ) : null}

            {logUnder === 1 ? logBox : null}
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
              <Button disabled={busy || !readiness?.parlourOk} onClick={() => void install()}>
                Install what is missing
              </Button>
              <span className="text-muted-foreground">{runNote}</span>
            </div>

            <Note>
              Runs <code className="font-mono">parlour init</code>: ffmpeg and whisper from Homebrew, the
              models, and whisper kept warm at login.
            </Note>

            {logUnder === 2 ? logBox : null}
          </Step>

          <Step
            index={3}
            title="The things it cannot work out"
            done={Boolean(present?.HA_TOKEN) && micGranted === true}
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
                  placeholder={present?.HA_TOKEN ? "set, leave blank to keep" : "not set"}
                  value={haToken}
                  onChange={(event) => setHaToken(event.target.value)}
                />
              </div>
            </div>

            <Note>
              Your profile page in Home Assistant, Security tab, right at the bottom. It is the whole house,
              so it goes in secrets.env and never into git.
            </Note>

            <div className="mt-2.5 grid gap-1">
              <Label className="text-xs text-muted-foreground" htmlFor="ob-anthropic">
                Anthropic key, for the questions the local model hands over
              </Label>
              <Input
                id="ob-anthropic"
                type="password"
                autoComplete="off"
                placeholder={present?.ANTHROPIC_API_KEY ? "set, leave blank to keep" : "not set"}
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
                  {mics.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
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
              macOS asks once, for this app, and it is asked as soon as this page can ask it. Parlour hears
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
              Phones, satellites and Home Assistant all send one shared token. Without it Parlour answers this
              machine only.
            </Note>

            <div className="mt-2.5 flex items-center gap-2.5">
              <Button disabled={!readiness?.parlourOk} onClick={() => void save()}>
                Save
              </Button>
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
                    tone={toneOf(check.status)}
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
