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
  loginItem,
  readConfig,
  secretsStatus,
  setLoginItem,
  setSecret,
  setSettings,
  writeConfig,
} from "@/lib/bridge";
import { cn } from "@/lib/utils";

/** Everything the form edits apart from the three write-only secrets. */
interface FormValues {
  parlourBin: string;
  autostart: boolean;
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

/**
 * What the providers fall back to when the config says nothing. The config is
 * read as written, so a key arrives absent until someone has set it, and the
 * form has to know the answer the box is standing in for. These match the
 * `.default()` on each provider's schema in packages/parlour.
 */
const LOCAL_BASE_URL = "http://127.0.0.1:1234/v1";
const LOCAL_MODEL = "qwen3-8b-mlx";
const CLOUD_MODEL = "claude-opus-5";
const HA_URL = "http://homeassistant.local:8123";

const EMPTY: FormValues = {
  parlourBin: "",
  autostart: false,
  wakeWord: "hey_jarvis",
  wakeThreshold: 0.5,
  inputDevice: ":0",
  silenceMs: "800",
  voice: "bf_emma",
  localBaseUrl: LOCAL_BASE_URL,
  localModel: LOCAL_MODEL,
  cloudEnabled: true,
  cloudModel: CLOUD_MODEL,
  haBaseUrl: HA_URL,
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

/**
 * The parts of the config this form edits, each created on the object when it
 * is missing so a load and a save address the same nested objects. Done once
 * here rather than inline, because seven assignments in the middle of a read
 * are hard to see past.
 */
function sections(config: AgentConfig) {
  config.audio ??= {};
  config.wake ??= {};
  config.tts ??= {};
  config.llm ??= {};
  config.llm.local ??= {};
  config.llm.cloud ??= {};
  config.integrations ??= {};
  config.integrations["home-assistant"] ??= {};
  return {
    audio: config.audio,
    wake: config.wake,
    tts: config.tts,
    local: config.llm.local,
    cloud: config.llm.cloud,
    house: config.integrations["home-assistant"],
  };
}

/** Writes the trimmed value, or removes the key when nothing was typed. */
function setOrClear(target: Record<string, unknown>, key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed) target[key] = trimmed;
  else delete target[key];
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
  const [networkToken, setNetworkToken] = useState("");
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [placeholders, setPlaceholders] = useState({
    haToken: "unchanged",
    anthropicKey: "unchanged",
    networkToken: "unchanged",
  });
  const [flash, setFlash] = useState<Flash | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * Parlour's config is not written until it was read, so a failed load cannot
   * be written back over the file. The app's own two settings are not gated:
   * a wrong path to parlour is what makes the load fail, and this form is
   * where it gets corrected.
   */
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Opening at login is the system's setting rather than the form's, so it is
  // changed the moment it is ticked. Null is a build that does not offer it,
  // which is also a build with parlour inside it and no path to choose.
  const [atLogin, setAtLogin] = useState<boolean | null>(null);
  useEffect(() => {
    loginItem()
      .then(setAtLogin)
      .catch(() => setAtLogin(null));
  }, []);

  // Parlour's own config is edited in place rather than shadowed, so the keys
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

      // The app's own two settings go onto the form before the config is
      // asked for, because a wrong path is what makes that ask fail, and the
      // form must then show the wrong path rather than an empty box. Saving
      // from an empty form would also turn autostart off without anyone
      // ticking anything.
      setValues((previous) => ({
        ...previous,
        parlourBin: settings.parlourBin ?? "",
        autostart: settings.autostart ?? false,
      }));

      // The file as written, so a missing file reads as an empty document
      // rather than as an error. What the form shows for an absent key is its
      // own fallback below, and a save writes out only the keys the form sets.
      const config = await readConfig();
      if (!mine()) return;

      const { audio, wake, tts, local, cloud, house } = sections(config);
      configRef.current = config;

      // A missing device means the first one, which is what ffmpeg calls ":0".
      const current = audio.inputDevice || ":0";

      setValues({
        parlourBin: settings.parlourBin ?? "",
        autostart: settings.autostart ?? false,
        // An empty wake word or voice is not an answer, it is what an older
        // window wrote when it was shown one it did not offer.
        wakeWord: wake.words?.[0] || "hey_jarvis",
        wakeThreshold: onScale(wake.threshold ?? 0.5),
        inputDevice: current,
        silenceMs: String(audio.silenceMs ?? 800),
        voice: tts.voice || "bf_emma",
        localBaseUrl: local.baseUrl || LOCAL_BASE_URL,
        localModel: local.model || LOCAL_MODEL,
        // Absent means on: only a written false turns the cloud off.
        cloudEnabled: cloud.enabled !== false,
        cloudModel: cloud.model || CLOUD_MODEL,
        haBaseUrl: house.url || HA_URL,
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

      const present = await secretsStatus();
      if (!mine()) return;
      setPlaceholders({
        haToken: present.HA_TOKEN ? KEPT : "not set",
        anthropicKey: present.ANTHROPIC_API_KEY ? KEPT : "not set",
        networkToken: present.PARLOUR_TOKEN ? KEPT : "not set, so nothing on the network can reach it",
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

  // `reloadKey` is not read by the load; it is the signal that something
  // outside this form wrote what the form is showing, so the list is
  // deliberately wider than the lint would have it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the trigger, not an input
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
    const { audio, wake, tts, local, cloud, house } = sections(config);

    audio.inputDevice = values.inputDevice;
    audio.silenceMs = Number(values.silenceMs);
    wake.words = [values.wakeWord];
    wake.threshold = values.wakeThreshold;
    tts.voice = values.voice;
    // A cleared box means "not set", not the empty string. `config write`
    // accepts "" for these, and the providers then run with it: doctor fails
    // the local model and the house is asked for at no address. Leaving the
    // key out lets the provider's own default apply instead.
    setOrClear(local, "baseUrl", values.localBaseUrl);
    setOrClear(local, "model", values.localModel);
    cloud.enabled = values.cloudEnabled;
    setOrClear(cloud, "model", values.cloudModel);
    setOrClear(house, "url", values.haBaseUrl);

    try {
      await setSettings({
        parlourBin: values.parlourBin.trim(),
        autostart: values.autostart,
      });
      if (loaded) {
        await writeConfig(config);
        // An empty box means "leave it alone", so only what was typed is sent.
        if (haToken) await setSecret("HA_TOKEN", haToken);
        if (anthropicKey) await setSecret("ANTHROPIC_API_KEY", anthropicKey);
        if (networkToken) await setSecret("PARLOUR_TOKEN", networkToken);
        setHaToken("");
        setAnthropicKey("");
        setNetworkToken("");
      }
      say(loaded ? "Saved." : "Saved where parlour is. The rest was not read, so it was not written.", "ok");
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
          {atLogin === null ? (
            <Field id="parlourBin" label="The parlour command">
              <Input
                id="parlourBin"
                spellCheck={false}
                placeholder="/opt/homebrew/bin/parlour"
                value={values.parlourBin}
                onChange={(event) => set("parlourBin", event.target.value)}
              />
            </Field>
          ) : (
            <div className="flex items-center gap-2">
              <Checkbox
                id="atLogin"
                checked={atLogin}
                onCheckedChange={(checked) =>
                  void setLoginItem(checked === true)
                    .then(setAtLogin)
                    .catch((error) => say(String(error), "error"))
                }
              />
              <Label htmlFor="atLogin" className="font-normal">
                Open Parlour when you log in
              </Label>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="autostart"
              checked={values.autostart}
              onCheckedChange={(checked) => set("autostart", checked === true)}
            />
            <Label htmlFor="autostart" className="font-normal">
              Start listening when this app opens
            </Label>
          </div>
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
          <Field id="networkToken" label="Access token">
            <Input
              id="networkToken"
              type="password"
              autoComplete="off"
              placeholder={placeholders.networkToken}
              value={networkToken}
              onChange={(event) => setNetworkToken(event.target.value)}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Phones, satellites and Home Assistant all send this. Without it Parlour answers this machine only.
          </p>
        </Group>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
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
