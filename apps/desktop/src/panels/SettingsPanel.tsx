import { Wand2 } from "lucide-react";
import { type FormEvent, type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  type AgentConfig,
  audioDevices,
  deviceValue,
  getSettings,
  readAgentConfig,
  secretsPresent,
  setSettings,
  writeAgentConfig,
  writeSecrets,
} from "@/lib/bridge";
import { cn } from "@/lib/utils";

/** Everything the form edits apart from the three write-only secrets. */
interface FormValues {
  agentDir: string;
  nodePath: string;
  wakeWord: string;
  wakeThreshold: number;
  inputDevice: string;
  /** Kept as text so the box can be empty mid-edit; coerced on save. */
  silenceMs: string;
  voice: string;
  localBaseUrl: string;
  localModel: string;
  cloudEnabled: boolean;
  cloudModel: string;
  haBaseUrl: string;
}

interface DeviceOption {
  value: string;
  label: string;
}

interface Flash {
  text: string;
  tone: "ok" | "error";
}

const EMPTY: FormValues = {
  agentDir: "",
  nodePath: "",
  wakeWord: "hey_jarvis",
  wakeThreshold: 0.5,
  inputDevice: ":0",
  silenceMs: "800",
  voice: "bf_emma",
  localBaseUrl: "http://127.0.0.1:1234/v1",
  localModel: "",
  cloudEnabled: true,
  cloudModel: "claude-opus-5",
  haBaseUrl: "",
};

const WAKE_WORDS: DeviceOption[] = [
  { value: "hey_jarvis", label: "hey jarvis" },
  { value: "alexa", label: "alexa" },
  { value: "hey_mycroft", label: "hey mycroft" },
];

const VOICES: DeviceOption[] = [
  { value: "bf_emma", label: "Emma, British" },
  { value: "bf_isabella", label: "Isabella, British" },
  { value: "bm_george", label: "George, British" },
  { value: "bm_lewis", label: "Lewis, British" },
];

const KEPT = "set, leave blank to keep";

const THRESHOLD_MIN = 0.2;
const THRESHOLD_MAX = 0.9;
const THRESHOLD_STEP = 0.05;

/**
 * Sensitivity used to be a range input, which quietly pulled an out of range
 * number onto its own scale before anyone saw it, and the save then wrote the
 * corrected value back. A slider shows whatever it is handed, so a hand edited
 * 0.95 would sit at the end of the track and still be saved as 0.95.
 */
function onScale(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  const clamped = Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, value));
  const steps = Math.round((clamped - THRESHOLD_MIN) / THRESHOLD_STEP);
  return Number((THRESHOLD_MIN + steps * THRESHOLD_STEP).toFixed(2));
}

/**
 * A configured answer this list does not offer is still the answer, so it joins
 * the list. Dropping it would leave the control looking empty and give no clue
 * what is actually saved.
 */
function withCurrent(options: DeviceOption[], current: string): DeviceOption[] {
  if (!current || options.some((option) => option.value === current)) return options;
  return [{ value: current, label: `${current} (from the config)` }, ...options];
}

function Group({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 px-4">{children}</CardContent>
    </Card>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function SettingsPanel({
  onSaved,
  onOpenSetup,
  reloadKey,
}: {
  onSaved: () => void;
  onOpenSetup: () => void;
  /** Bumped when something outside this form wrote the settings it is showing. */
  reloadKey?: number;
}): JSX.Element {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [haToken, setHaToken] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [agentToken, setAgentToken] = useState("");
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [placeholders, setPlaceholders] = useState({
    haToken: "unchanged",
    anthropicKey: "unchanged",
    agentToken: "unchanged",
  });
  const [flash, setFlash] = useState<Flash | null>(null);
  const [saving, setSaving] = useState(false);
  /** Nothing is saved until something was read, so a failed load cannot be written back. */
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The agent's own config is edited in place rather than shadowed, so the keys
  // this window knows nothing about survive a load and a save untouched.
  const configRef = useRef<AgentConfig>({});
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Two loads can overlap, and the slower one must not win: it would leave the
  // ref holding the older parse, which the next save writes back over the file.
  const loadId = useRef(0);

  const say = useCallback((text: string, tone: Flash["tone"]) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ text, tone });
    flashTimer.current = setTimeout(() => setFlash(null), 4000);
  }, []);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    const mine = () => id === loadId.current;

    try {
      const settings = await getSettings();
      if (!mine()) return;

      let config: AgentConfig = {};
      try {
        config = JSON.parse(await readAgentConfig()) as AgentConfig;
      } catch (error) {
        // A missing file is the normal state before the first install, so this
        // says so and carries on with an empty config rather than giving up.
        say(`could not read agent.config.json: ${String(error)}`, "error");
        config = {};
      }
      if (!mine()) return;

      const audio = (config.audio ??= {});
      const wake = (config.wake ??= {});
      const tts = (config.tts ??= {});
      const llm = (config.llm ??= {});
      const local = (llm.local ??= {});
      const cloud = (llm.cloud ??= {});
      const house = (config.homeAssistant ??= {});
      configRef.current = config;

      // A missing device means the first one, which is what ffmpeg calls ":0".
      const current = audio.inputDevice || ":0";

      setValues({
        agentDir: settings.agentDir ?? "",
        nodePath: settings.nodePath ?? "",
        // An empty wake word or voice is not an answer, it is what an older
        // window wrote when it was shown one it did not offer.
        wakeWord: wake.words?.[0] || "hey_jarvis",
        wakeThreshold: onScale(wake.threshold ?? 0.5),
        inputDevice: current,
        silenceMs: String(audio.silenceMs ?? 800),
        voice: tts.voice || "bf_emma",
        localBaseUrl: local.baseUrl ?? "http://127.0.0.1:1234/v1",
        localModel: local.model ?? "",
        // Absent means on: only a written false turns the cloud off.
        cloudEnabled: cloud.enabled !== false,
        cloudModel: cloud.model ?? "claude-opus-5",
        haBaseUrl: house.baseUrl ?? "",
      });

      let options: DeviceOption[] = [];
      try {
        options = (await audioDevices()).map((device) => ({
          value: deviceValue(device, current),
          label: device,
        }));
      } catch (error) {
        say(`could not list microphones: ${String(error)}`, "error");
      }
      if (!mine()) return;
      // A device the machine no longer offers is still the saved answer, so it
      // stays on the list rather than silently becoming something else.
      if (!options.some((option) => option.value === current)) {
        options.unshift({ value: current, label: `${current} (current)` });
      }
      // Two unnumbered devices fall back to the same value, and a list holding
      // one value twice cannot say which of them was chosen.
      const seen = new Set<string>();
      setDevices(
        options.filter((option) => {
          if (seen.has(option.value)) return false;
          seen.add(option.value);
          return true;
        }),
      );

      const present = await secretsPresent();
      if (!mine()) return;
      setPlaceholders({
        haToken: present.haToken ? KEPT : "not set",
        anthropicKey: present.anthropicKey ? KEPT : "not set",
        agentToken: present.agentToken ? KEPT : "not set, so nothing on the network can reach it",
      });
      setLoadError(null);
      setLoaded(true);
    } catch (error) {
      // A form that failed to load is showing defaults rather than the house's
      // answers, so the failure stays on screen and holds the save shut. A load
      // that lost a race has already been replaced, and its failure with it.
      if (!mine()) return;
      setLoaded(false);
      setLoadError(`Could not read the settings: ${String(error)}`);
    }
  }, [say]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const set = <Key extends keyof FormValues>(key: Key, value: FormValues[Key]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const config = configRef.current;
    const audio = (config.audio ??= {});
    const wake = (config.wake ??= {});
    const tts = (config.tts ??= {});
    const llm = (config.llm ??= {});
    const local = (llm.local ??= {});
    const cloud = (llm.cloud ??= {});
    const house = (config.homeAssistant ??= {});

    audio.inputDevice = values.inputDevice;
    audio.silenceMs = Number(values.silenceMs);
    wake.words = [values.wakeWord];
    wake.threshold = values.wakeThreshold;
    tts.voice = values.voice;
    local.baseUrl = values.localBaseUrl.trim();
    local.model = values.localModel.trim();
    cloud.enabled = values.cloudEnabled;
    cloud.model = values.cloudModel.trim();
    house.baseUrl = values.haBaseUrl.trim();

    try {
      await setSettings({
        agentDir: values.agentDir.trim(),
        nodePath: values.nodePath.trim(),
      });
      await writeAgentConfig(config);
      // An empty box means "leave it alone", so only send what was typed.
      await writeSecrets({
        haToken: haToken || null,
        anthropicKey: anthropicKey || null,
        braveKey: null,
        agentToken: agentToken || null,
      });
      setHaToken("");
      setAnthropicKey("");
      setAgentToken("");
      say("Saved.", "ok");
      await load();
      onSaved();
    } catch (error) {
      say(String(error), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Settings</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onOpenSetup}>
          <Wand2 />
          Run setup again
        </Button>
      </div>

      <form className="grid gap-4" onSubmit={save}>
        <Group title="Where things are">
          <Field id="agentDir" label="Agent directory">
            <Input
              id="agentDir"
              spellCheck={false}
              value={values.agentDir}
              onChange={(event) => set("agentDir", event.target.value)}
            />
          </Field>
          <Field id="nodePath" label="Node binary">
            <Input
              id="nodePath"
              spellCheck={false}
              value={values.nodePath}
              onChange={(event) => set("nodePath", event.target.value)}
            />
          </Field>
        </Group>

        <Group title="Listening">
          <Field id="wakeWord" label="Wake word">
            <Select value={values.wakeWord} onValueChange={(value) => set("wakeWord", value)}>
              <SelectTrigger id="wakeWord" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {withCurrent(WAKE_WORDS, values.wakeWord).map((word) => (
                  <SelectItem key={word.value} value={word.value}>
                    {word.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="wakeThreshold">Sensitivity</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {values.wakeThreshold.toFixed(2)}
              </span>
            </div>
            <Slider
              id="wakeThreshold"
              min={THRESHOLD_MIN}
              max={THRESHOLD_MAX}
              step={THRESHOLD_STEP}
              value={[values.wakeThreshold]}
              onValueChange={([next]) => set("wakeThreshold", next ?? values.wakeThreshold)}
            />
          </div>

          <Field id="inputDevice" label="Microphone">
            <Select value={values.inputDevice} onValueChange={(value) => set("inputDevice", value)}>
              <SelectTrigger id="inputDevice" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.value} value={device.value}>
                    {device.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="silenceMs" label="Silence before it answers (ms)">
            <Input
              id="silenceMs"
              type="number"
              min={200}
              max={3000}
              step={50}
              value={values.silenceMs}
              onChange={(event) => set("silenceMs", event.target.value)}
            />
          </Field>
        </Group>

        <Group title="Speaking">
          <Field id="voice" label="Voice">
            <Select value={values.voice} onValueChange={(value) => set("voice", value)}>
              <SelectTrigger id="voice" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {withCurrent(VOICES, values.voice).map((voice) => (
                  <SelectItem key={voice.value} value={voice.value}>
                    {voice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Group>

        <Group title="Models">
          <Field id="localBaseUrl" label="Local server">
            <Input
              id="localBaseUrl"
              spellCheck={false}
              value={values.localBaseUrl}
              onChange={(event) => set("localBaseUrl", event.target.value)}
            />
          </Field>
          <Field id="localModel" label="Local model">
            <Input
              id="localModel"
              spellCheck={false}
              value={values.localModel}
              onChange={(event) => set("localModel", event.target.value)}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox
              id="cloudEnabled"
              checked={values.cloudEnabled}
              onCheckedChange={(checked) => set("cloudEnabled", checked === true)}
            />
            <Label htmlFor="cloudEnabled" className="font-normal">
              Hand hard questions to the cloud
            </Label>
          </div>
          <Field id="cloudModel" label="Cloud model">
            <Input
              id="cloudModel"
              spellCheck={false}
              value={values.cloudModel}
              onChange={(event) => set("cloudModel", event.target.value)}
            />
          </Field>
        </Group>

        <Group title="The house">
          <Field id="haBaseUrl" label="Home Assistant">
            <Input
              id="haBaseUrl"
              spellCheck={false}
              value={values.haBaseUrl}
              onChange={(event) => set("haBaseUrl", event.target.value)}
            />
          </Field>
          <Field id="haToken" label="Token">
            <Input
              id="haToken"
              type="password"
              autoComplete="off"
              placeholder={placeholders.haToken}
              value={haToken}
              onChange={(event) => setHaToken(event.target.value)}
            />
          </Field>
          <Field id="anthropicKey" label="Anthropic key">
            <Input
              id="anthropicKey"
              type="password"
              autoComplete="off"
              placeholder={placeholders.anthropicKey}
              value={anthropicKey}
              onChange={(event) => setAnthropicKey(event.target.value)}
            />
          </Field>
        </Group>

        <Group title="The network">
          <Field id="agentToken" label="Access token">
            <Input
              id="agentToken"
              type="password"
              autoComplete="off"
              placeholder={placeholders.agentToken}
              value={agentToken}
              onChange={(event) => setAgentToken(event.target.value)}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Phones, satellites and Home Assistant all send this. Without it the agent answers this machine
            only.
          </p>
        </Group>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !loaded}>
            Save
          </Button>
          <span
            className={cn(
              "text-sm",
              flash?.tone === "error" || (loadError !== null && !flash)
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {flash?.text ?? loadError ?? ""}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
          Saving while it is running takes effect at the next start.
        </p>
      </form>
    </div>
  );
}
