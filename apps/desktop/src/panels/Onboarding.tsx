// The first run, one question at a time. Everything here writes through the
// same CLI the Settings tab uses, and the installing is Parlour's own `init`,
// so nothing in this file is a second way of doing something. What it adds is
// the order: the one thing that has to happen first is all the page shows, and
// anything optional or only sometimes needed stays folded away until asked for.

import { ArrowLeft, Copy, House, Mic, Sparkles, Wifi } from "lucide-react";
import { type JSX, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
import {
  Disclosure,
  Heading,
  Mark,
  Note,
  Optional,
  Row,
  type StepMeta,
  Stepper,
  type Tone,
} from "@/panels/onboarding/parts";

const HA_DEFAULT = "http://homeassistant.local:8123";
const WAKE_DEFAULT = "hey_jarvis";
const DEVICE_DEFAULT = ":0";
const NODE_INSTALL = "brew install node";

const WAKE_WORDS: { value: string; label: string }[] = [
  { value: "hey_jarvis", label: "hey jarvis" },
  { value: "alexa", label: "alexa" },
  { value: "hey_mycroft", label: "hey mycroft" },
];

type StepName = "install" | "voice" | "home" | "extras" | "finish";

/** The welcome is not a step: it asks nothing, so it has no place in the row along the top. */
type Screen = "welcome" | StepName;

const STEPS: StepMeta<StepName>[] = [
  { name: "install", label: "Install" },
  { name: "voice", label: "Voice" },
  { name: "home", label: "Home" },
  { name: "extras", label: "Extras" },
  { name: "finish", label: "Finish" },
];

const indexOf = (name: StepName) => STEPS.findIndex((step) => step.name === name);

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
};

/** The doctor's three states as the marks this page draws. */
function toneOf(status: Check["status"]): Tone {
  return status === "ok" ? "ok" : status === "fail" ? "bad" : "warn";
}

/** What went wrong with node, which is the one piece this page cannot install. */
function nodeDetail(readiness: Readiness): string {
  if (readiness.nodeOk) return `node ${readiness.nodeVersion}`;
  if (readiness.nodeVersion) return `node ${readiness.nodeVersion} is too old. Parlour needs 22 or newer.`;
  return "Parlour runs on Node 22 or newer, and none was found.";
}

/** Which of the install's own jobs is running, so its row can spin. */
type Job = "cli" | "setup" | null;

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
  const [screen, setScreen] = useState<Screen>("welcome");
  /** The furthest step shown so far, which is how far back and forth the row along the top allows. */
  const [reached, setReached] = useState(0);

  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [present, setPresent] = useState<SecretsStatus | null>(null);
  /** Drawn instead of the install rows when the Rust side would not answer at all. */
  const [whereError, setWhereError] = useState<string | null>(null);

  const [bin, setBin] = useState("");
  const [job, setJob] = useState<Job>(null);
  const [failed, setFailed] = useState<Job>(null);
  const [activity, setActivity] = useState("");
  const [log, setLog] = useState("");
  const [logOpen, setLogOpen] = useState(false);

  const [haUrl, setHaUrl] = useState(HA_DEFAULT);
  const [haToken, setHaToken] = useState("");
  const [cloud, setCloud] = useState(false);
  const [anthropic, setAnthropic] = useState("");
  const [network, setNetwork] = useState(false);
  const [wake, setWake] = useState(WAKE_DEFAULT);
  const [mic, setMic] = useState(DEVICE_DEFAULT);
  const [mics, setMics] = useState<{ value: string; label: string }[]>([]);

  const [saving, setSaving] = useState(false);
  const [stepNote, setStepNote] = useState("");

  const [checks, setChecks] = useState<Check[] | null>(null);
  const [doctorNote, setDoctorNote] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [asking, setAsking] = useState(false);
  const [micDetail, setMicDetail] = useState("");
  /** Undefined until it has been asked, because asking is what shows the prompt. */
  const [micGranted, setMicGranted] = useState<boolean | undefined>(undefined);

  const askingRef = useRef(false);
  /** A microphone chosen while an ask was still up, waiting its turn. */
  const queuedRef = useRef<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const atBottomRef = useRef(true);
  const startedRef = useRef(false);
  const wasOpenRef = useRef(open);

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
    setMicDetail("Answer the prompt macOS puts up.");
    try {
      const result = await microphoneCheck(device);
      setMicGranted(result.granted);
      setMicDetail(result.detail);
    } catch (error) {
      setMicGranted(false);
      setMicDetail(String(error));
    } finally {
      askingRef.current = false;
      setAsking(false);
      const queued = queuedRef.current;
      queuedRef.current = null;
      if (queued !== null) void ask(queued);
    }
  }, []);

  /**
   * Fills the answers from whatever is already configured. Everything comes
   * through the CLI, so with no parlour yet the answers stay at their
   * defaults, which is the normal first run state.
   */
  const loadAnswers = useCallback(async (parlourOk: boolean) => {
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
        setCloud(secrets.ANTHROPIC_API_KEY && config.llm?.cloud?.enabled !== false);
      } catch {
        // A CLI that will not answer is reported on the install step, not here.
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
  }, []);

  /** Asks the Rust side what is in place, and redraws around the answer. */
  const refresh = useCallback(async (): Promise<Readiness> => {
    const next = await setupStatus();
    setReadiness(next);
    setBin(next.parlourBin ?? "");
    setWhereError(null);
    await loadAnswers(next.parlourOk);
    return next;
  }, [loadAnswers]);

  const go = useCallback((next: Screen) => {
    setScreen(next);
    setStepNote("");
    if (next !== "welcome") setReached((far) => Math.max(far, indexOf(next)));
  }, []);

  useEffect(() => {
    // Guarded because a second run would read everything twice over.
    if (startedRef.current) return;
    startedRef.current = true;
    void refresh()
      .then((next) => {
        // Opens itself when there is something still to do, which on a fresh
        // machine is everything, and starts at the welcome.
        if (!next.installed) setSelfOpen(true);
      })
      // Nothing here draws without an answer, and a packaged app has no console
      // to find out why in, so the failure goes where the diagnosis would.
      .catch((error: unknown) => setWhereError(String(error)));
  }, [refresh]);

  useEffect(() => {
    // Asked for from Settings, so catch up on what has changed since, and skip
    // the welcome: someone running setup again knows what Parlour is. On a
    // machine that is already installed every step is open to jump to.
    if (open && !wasOpenRef.current) {
      void refresh()
        .then((next) => {
          setScreen("install");
          setStepNote("");
          setReached(next.installed ? STEPS.length - 1 : 0);
        })
        .catch((error: unknown) => {
          setWhereError(String(error));
          setScreen("install");
        });
    }
    wasOpenRef.current = open;
  }, [open, refresh]);

  useEffect(() => {
    const pending = onSetupEvent((event) => {
      // `done` carries the verdict as "0" or "1", which is the exit status the
      // Rust side reads, not a line for a person.
      if (event.kind === "done") return;
      const element = logRef.current;
      atBottomRef.current = !element || element.scrollTop + element.clientHeight >= element.scrollHeight - 20;
      setLog((previous) => `${previous}${PREFIX[event.kind] ?? "    "}${event.text}\n`);
      // The step names are the progress a person can follow without the log.
      if (event.kind === "step") setActivity(event.text);
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
  }, [log, logOpen]);

  const dismiss = useCallback(() => {
    setSelfOpen(false);
    onClose();
  }, [onClose]);

  // ----------------------------------------------------------------- install

  /** A path typed by hand, taken when the box is left or Enter is pressed rather than per keystroke. */
  const commitBin = async () => {
    try {
      // The other setting is read back first so that changing the path cannot reset it.
      const current = await getSettings();
      if (current.parlourBin === bin.trim()) return;
      await setSettings({ ...current, parlourBin: bin.trim() });
      await refresh();
    } catch (error) {
      setWhereError(String(error));
    }
  };

  /**
   * The one button: the CLI from npm if it is missing, then `parlour init` for
   * everything behind it. Each half says how it went on its own row, and the
   * log opens by itself if either of them fails.
   */
  const install = async () => {
    setLog("");
    setFailed(null);
    let current = readiness;
    let running: Job = null;
    try {
      if (!current?.parlourOk) {
        running = "cli";
        setJob(running);
        setActivity("Installing the parlour command with npm");
        const ok = await installCli();
        current = await refresh();
        if (!ok || !current.parlourOk) {
          setFailed("cli");
          setLogOpen(true);
          setActivity("npm did not finish. The details say why.");
          return;
        }
      }
      running = "setup";
      setJob(running);
      setActivity("Getting started. The models are large, so this takes a while.");
      const ok = await runSetup(true);
      current = await refresh();
      if (!ok || !current.installed) {
        setFailed("setup");
        setLogOpen(true);
        setActivity("Finished, with something still to fix. The details say what.");
        return;
      }
      setActivity("");
    } catch (error) {
      setFailed(running ?? "setup");
      setLogOpen(true);
      setActivity(String(error));
    } finally {
      setJob(null);
    }
  };

  // ------------------------------------------------------------------- saves

  /** Reads the file, lets `change` edit it, and writes it back, so a step only touches its own keys. */
  const saveStep = async (
    change: (config: Awaited<ReturnType<typeof readConfig>>) => void | Promise<void>,
  ) => {
    setSaving(true);
    setStepNote("");
    try {
      const config = await readConfig();
      await change(config);
      await writeConfig(config);
      onSaved();
      return true;
    } catch (error) {
      setStepNote(String(error));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveVoice = async () => {
    const ok = await saveStep((config) => {
      config.audio ??= {};
      config.wake ??= {};
      config.audio.inputDevice = mic;
      config.wake.words = [wake];
    });
    if (ok) go("home");
  };

  const saveHome = async () => {
    const ok = await saveStep(async (config) => {
      config.integrations ??= {};
      config.integrations["home-assistant"] ??= {};
      // A cleared box means "not set", not the empty string: `config write`
      // would accept "" and the house would then be asked for at no address.
      // Leaving the key out lets the integration's own default apply.
      const url = haUrl.trim();
      if (url) config.integrations["home-assistant"].url = url;
      else delete config.integrations["home-assistant"].url;
      if (haToken) await setSecret("HA_TOKEN", haToken);
    });
    if (ok) {
      setHaToken("");
      await refresh().catch(() => undefined);
      go("extras");
    }
  };

  const saveExtras = async () => {
    if (cloud && !anthropic && !present?.ANTHROPIC_API_KEY) {
      setStepNote("Paste an Anthropic key, or switch cloud help off.");
      return;
    }
    const ok = await saveStep(async (config) => {
      config.llm ??= {};
      config.llm.cloud ??= {};
      // Nothing to escalate to without a key, and a cloud model that cannot be
      // reached is a slow way to fail. The key itself is kept when switched
      // off, so switching back on does not mean finding it again.
      config.llm.cloud.enabled = cloud;
      if (cloud && anthropic) await setSecret("ANTHROPIC_API_KEY", anthropic);
      // Switching this on mints a token once: a second one would lock out every
      // phone and satellite already holding the first. Switching it off takes
      // the house back off the network.
      if (network && !hasToken) await setSecret("PARLOUR_TOKEN", mintToken());
      if (!network && hasToken) await setSecret("PARLOUR_TOKEN", "");
    });
    if (ok) {
      setAnthropic("");
      await refresh().catch(() => undefined);
      go("finish");
    }
  };

  // ------------------------------------------------------------------ finish

  const doctor = useCallback(async () => {
    setChecks(null);
    setDoctorNote(null);
    try {
      setChecks(await runDoctor());
    } catch (error) {
      setChecks([]);
      setDoctorNote(`Could not run the check: ${error}`);
    }
  }, []);

  // Arriving at the end is when to look everything over, without a button for it.
  useEffect(() => {
    if (visible && screen === "finish") void doctor();
  }, [visible, screen, doctor]);

  const start = async () => {
    setStarting(true);
    try {
      await startAgent();
      dismiss();
    } catch (error) {
      // A house that will not start is a thing to read, not to throw.
      setDoctorNote(String(error));
    } finally {
      setStarting(false);
    }
  };

  // ------------------------------------------------------------------ render

  if (!visible) return null;

  const wakeLabel = (
    WAKE_WORDS.find((word) => word.value === wake)?.label ?? wake.replaceAll("_", " ")
  ).replace(/^./, (first) => first.toUpperCase());

  const busy = job !== null;

  const logBox = (
    <pre
      ref={logRef}
      className="max-h-[200px] overflow-y-auto rounded-lg border bg-background px-3 py-2.5 font-mono text-[11px] leading-normal break-words whitespace-pre-wrap"
    >
      {log || "Nothing yet."}
    </pre>
  );

  let body: JSX.Element;
  let primary: JSX.Element | null = null;
  let secondary: JSX.Element | null = null;

  switch (screen) {
    case "welcome": {
      body = (
        <div className="flex flex-col items-center pt-6 text-center">
          <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Mic className="size-7" aria-hidden />
          </span>
          <h2 className="text-[20px] font-semibold">Welcome to Parlour</h2>
          <p className="mt-2 max-w-[380px] text-muted-foreground">
            A voice assistant for the house that runs on this Mac. Say the wake word, ask for what you want,
            and it answers out loud.
          </p>
          <ol className="mt-6 grid w-full max-w-[380px] gap-2 text-left">
            {[
              ["Install", "The parlour command, speech tools and a local model."],
              ["Voice", "Which microphone to listen on, and the word that wakes it."],
              ["Home", "Your Home Assistant, if you have one."],
              ["Extras", "Cloud help and other devices, both optional."],
            ].map(([name, what], index) => (
              <li key={name} className="flex gap-3 rounded-lg border bg-card px-3 py-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-border text-[11px] tabular-nums">
                  {index + 1}
                </span>
                <span>
                  <span className="font-medium">{name}</span>
                  <span className="block text-muted-foreground">{what}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[13px] text-muted-foreground">
            About ten minutes, most of it downloading. You can stop and come back.
          </p>
        </div>
      );
      primary = <Button onClick={() => go("install")}>Get started</Button>;
      break;
    }

    case "install": {
      const cliTone: Tone = readiness?.parlourOk
        ? "ok"
        : job === "cli"
          ? "busy"
          : failed === "cli"
            ? "bad"
            : "todo";
      const setupTone: Tone = readiness?.installed
        ? "ok"
        : job === "setup"
          ? "busy"
          : failed === "setup"
            ? "bad"
            : "todo";
      const missing = readiness
        ? [!readiness.ffmpeg && "ffmpeg", !readiness.config && "the config"].filter(Boolean).join(" and ")
        : "";

      body = (
        <>
          <Heading title="Install Parlour">
            Everything runs on this Mac. The speech tools come from Homebrew and the models are downloaded
            once.
          </Heading>

          {whereError !== null ? (
            <Row tone="bad" name="Could not look" detail={whereError} />
          ) : !readiness ? (
            <p className="text-muted-foreground">Looking at what is already here...</p>
          ) : (
            <ul className="grid gap-2">
              <Row tone={readiness.nodeOk ? "ok" : "bad"} name="Node.js" detail={nodeDetail(readiness)}>
                {readiness.nodeOk ? null : (
                  <div className="mt-2 grid gap-2">
                    <p className="text-muted-foreground">Install it in Terminal, then check again:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-md border bg-background px-2.5 py-1.5 font-mono text-[12px]">
                        {NODE_INSTALL}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Copy the command"
                        onClick={() => void navigator.clipboard?.writeText(NODE_INSTALL)}
                      >
                        <Copy />
                      </Button>
                    </div>
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refresh().catch(() => undefined)}
                      >
                        Check again
                      </Button>
                    </div>
                  </div>
                )}
              </Row>
              <Row
                tone={cliTone}
                name="The parlour command"
                detail={
                  readiness.parlourOk
                    ? `parlour ${readiness.parlourVersion}`
                    : "From npm, at this app's version."
                }
              />
              <Row
                tone={setupTone}
                name="Speech and models"
                detail={
                  readiness.installed
                    ? "ffmpeg, whisper and the models are in place."
                    : missing
                      ? `ffmpeg, whisper, a local model and its config. Still to do: ${missing}.`
                      : "ffmpeg, whisper, a local model and its config."
                }
              />
            </ul>
          )}

          {activity ? (
            <p className="mt-3 flex items-start gap-2 text-muted-foreground" aria-live="polite">
              {busy ? <Mark tone="busy" /> : null}
              {activity}
            </p>
          ) : null}

          <Disclosure label="Show details" open={logOpen} onOpenChange={setLogOpen}>
            {logBox}
          </Disclosure>

          <Disclosure label="Already have parlour somewhere else?">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground" htmlFor="ob-bin">
                Path to the parlour command
              </Label>
              <Input
                id="ob-bin"
                spellCheck={false}
                placeholder="/opt/homebrew/bin/parlour"
                value={bin}
                disabled={busy}
                onChange={(event) => setBin(event.target.value)}
                onBlur={() => void commitBin()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void commitBin();
                }}
              />
            </div>
            <Note>Only needed when it is not on the PATH a login shell has.</Note>
          </Disclosure>
        </>
      );

      primary = readiness?.installed ? (
        <Button onClick={() => go("voice")}>Continue</Button>
      ) : (
        <Button disabled={busy || !readiness?.nodeOk} onClick={() => void install()}>
          {busy ? "Installing..." : failed ? "Try again" : "Install"}
        </Button>
      );
      secondary = <BackButton onClick={() => go("welcome")} disabled={busy} />;
      break;
    }

    case "voice": {
      // A wake word written into the config by hand is still the wake word, so it
      // joins the list rather than leaving the choice looking empty.
      const wakeWords = WAKE_WORDS.some((word) => word.value === wake)
        ? WAKE_WORDS
        : [{ value: wake, label: `${wake} (from the config)` }, ...WAKE_WORDS];
      const micTone: Tone = asking ? "busy" : micGranted ? "ok" : "bad";

      body = (
        <>
          <Heading title="How it hears you">
            Parlour listens through this app, all the time, for the wake word only. Nothing leaves the Mac
            until it hears it.
          </Heading>

          <div className="grid gap-2">
            {micGranted === undefined && !asking ? (
              <div className="rounded-xl border bg-card px-4 py-4">
                <p className="font-medium">Allow the microphone</p>
                <p className="mt-1 text-muted-foreground">
                  macOS asks once. Saying no here means silence later, though it can be changed in System
                  Settings.
                </p>
                <Button className="mt-3" onClick={() => void ask(mic)}>
                  <Mic />
                  Allow microphone
                </Button>
              </div>
            ) : (
              <ul>
                <Row
                  tone={micTone}
                  name={
                    asking ? "Asking for the microphone" : micGranted ? "Microphone allowed" : "No microphone"
                  }
                  detail={micDetail}
                >
                  {!asking && !micGranted ? (
                    <div className="mt-2 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void openPrivacySettings()}>
                        Open System Settings
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void ask(mic)}>
                        Ask again
                      </Button>
                    </div>
                  ) : null}
                </Row>
              </ul>
            )}
          </div>

          <fieldset className="mt-5">
            <legend className="mb-2 font-medium">Wake word</legend>
            <div className="grid grid-cols-3 gap-2">
              {wakeWords.map((word) => (
                <label
                  key={word.value}
                  className={cn(
                    "cursor-pointer rounded-lg border bg-card px-3 py-2.5 text-center has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                    wake === word.value && "border-primary bg-primary/10 font-medium",
                  )}
                >
                  <input
                    type="radio"
                    name="ob-wake"
                    value={word.value}
                    checked={wake === word.value}
                    onChange={() => setWake(word.value)}
                    className="sr-only"
                  />
                  {word.label}
                </label>
              ))}
            </div>
          </fieldset>

          <Disclosure label="Use a different microphone">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground" htmlFor="ob-mic">
                Microphone
              </Label>
              <Select
                value={mic}
                onValueChange={(value) => {
                  setMic(value);
                  // A different microphone is a different question only in so far
                  // as the device has to open; the permission itself is the app's.
                  if (micGranted !== undefined) void ask(value);
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
          </Disclosure>
        </>
      );

      primary = (
        <Button disabled={saving || asking} onClick={() => void saveVoice()}>
          {micGranted === false ? "Continue anyway" : "Continue"}
        </Button>
      );
      secondary = <BackButton onClick={() => go("install")} disabled={saving} />;
      break;
    }

    case "home": {
      body = (
        <>
          <Heading title="Connect your home">
            Parlour runs the lights, heating and everything else through Home Assistant. No Home Assistant?
            Skip this: timers, questions and search still work.
          </Heading>

          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground" htmlFor="ob-ha-url">
                Home Assistant address
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
                Long-lived access token
              </Label>
              <Input
                id="ob-ha-token"
                type="password"
                autoComplete="off"
                placeholder={present?.HA_TOKEN ? "Already set. Leave blank to keep it." : "Paste the token"}
                value={haToken}
                onChange={(event) => setHaToken(event.target.value)}
              />
            </div>
          </div>

          <Disclosure label="Where do I find a token?">
            <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
              <li>Open Home Assistant and click your name at the bottom of the sidebar.</li>
              <li>Go to the Security tab and scroll right to the bottom.</li>
              <li>Under Long-lived access tokens, create one called Parlour and copy it.</li>
            </ol>
            <Note>It opens the whole house, so it is kept in secrets.env and never in the config.</Note>
          </Disclosure>
        </>
      );

      const ready = Boolean(haToken || present?.HA_TOKEN);
      primary = (
        <Button disabled={saving || !ready} onClick={() => void saveHome()}>
          Continue
        </Button>
      );
      secondary = (
        <>
          <BackButton onClick={() => go("voice")} disabled={saving} />
          <Button variant="ghost" disabled={saving} onClick={() => go("extras")}>
            Skip for now
          </Button>
        </>
      );
      break;
    }

    case "extras": {
      body = (
        <>
          <Heading title="Extras">Both optional, and both can be changed later in Settings.</Heading>

          <div className="grid gap-2.5">
            <Optional
              icon={<Sparkles />}
              title="Cloud help"
              summary="Questions the local model cannot answer go to Claude. Only the words, never the audio."
              on={cloud}
              onChange={setCloud}
            >
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="ob-anthropic">
                  Anthropic API key
                </Label>
                <Input
                  id="ob-anthropic"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    present?.ANTHROPIC_API_KEY ? "Already set. Leave blank to keep it." : "sk-ant-..."
                  }
                  value={anthropic}
                  onChange={(event) => setAnthropic(event.target.value)}
                />
              </div>
            </Optional>

            <Optional
              icon={<Wifi />}
              title="Other devices"
              summary="Let phones, satellites and Home Assistant talk to Parlour over the network."
              on={network}
              onChange={setNetwork}
            >
              <p className="text-muted-foreground">
                {hasToken
                  ? "A shared token is already set. Devices holding it keep working."
                  : "A shared token is made for you. The Status tab shows it, with a code to pair the iPhone app."}
              </p>
            </Optional>
          </div>
        </>
      );

      primary = (
        <Button disabled={saving} onClick={() => void saveExtras()}>
          Continue
        </Button>
      );
      secondary = <BackButton onClick={() => go("home")} disabled={saving} />;
      break;
    }

    case "finish": {
      const problems = checks?.filter((check) => check.status !== "ok") ?? [];
      const passed = checks?.filter((check) => check.status === "ok") ?? [];
      const failing = problems.some((check) => check.status === "fail");

      body = (
        <>
          <Heading
            title={checks === null ? "Checking everything over" : failing ? "Nearly there" : "All set"}
          >
            {checks === null
              ? "Running parlour doctor."
              : failing
                ? "Something below still needs fixing. Parlour can start without it, but may not work."
                : `Start Parlour, then try "${wakeLabel}, what time is it?"`}
          </Heading>

          {checks === null ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Mark tone="busy" />
              Checking...
            </p>
          ) : (
            <>
              {problems.length ? (
                <ul className="grid gap-2">
                  {problems.map((check) => (
                    <Row
                      key={check.name}
                      tone={toneOf(check.status)}
                      name={check.name}
                      detail={check.detail}
                    />
                  ))}
                </ul>
              ) : null}
              {passed.length ? (
                <Disclosure label={`${passed.length} ${passed.length === 1 ? "check" : "checks"} passed`}>
                  <ul className="grid gap-1.5">
                    {passed.map((check) => (
                      <Row key={check.name} tone="ok" name={check.name} detail={check.detail} />
                    ))}
                  </ul>
                </Disclosure>
              ) : null}
            </>
          )}

          {doctorNote ? <Note className="text-destructive">{doctorNote}</Note> : null}

          <div className="mt-5 flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
            <House className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-muted-foreground">
              Parlour lives in the menu bar. Settings has everything asked here and more, and Connectors signs
              in to the services it can use.
            </p>
          </div>
        </>
      );

      primary = (
        <Button disabled={checks === null || starting} onClick={() => void start()}>
          {starting ? "Starting..." : "Start Parlour"}
        </Button>
      );
      secondary = (
        <>
          <BackButton onClick={() => go("extras")} disabled={starting} />
          <Button variant="ghost" disabled={checks === null} onClick={() => void doctor()}>
            Check again
          </Button>
        </>
      );
      break;
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-background">
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h1 className="text-[15px] font-semibold">Set up Parlour</h1>
        <Button variant="ghost" size="sm" disabled={busy} onClick={dismiss}>
          {screen === "welcome" ? "Not now" : "Finish later"}
        </Button>
      </header>

      {screen !== "welcome" ? (
        <nav className="border-b px-4 pb-3">
          <Stepper steps={STEPS} current={screen} reached={busy ? -1 : reached} onPick={go} />
        </nav>
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {/* Keyed by step, so what one step had folded open does not carry to the next. */}
        <div key={screen} className="mx-auto max-w-[520px]">
          {body}
        </div>
      </main>

      <footer className="border-t px-5 py-3">
        {stepNote ? (
          <p className="mx-auto mb-2 max-w-[520px] text-right text-destructive" role="alert">
            {stepNote}
          </p>
        ) : null}
        <div className="mx-auto flex max-w-[520px] items-center justify-between gap-2">
          <div className="flex items-center gap-1">{secondary}</div>
          {primary}
        </div>
      </footer>
    </div>
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }): JSX.Element {
  return (
    <Button variant="ghost" disabled={disabled} onClick={onClick}>
      <ArrowLeft />
      Back
    </Button>
  );
}
