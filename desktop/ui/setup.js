// The first run. Everything here writes through the same commands the Settings
// tab uses, and the installing is the agent's own scripts/setup.sh, so nothing
// in this file is a second way of doing something.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);

/** The last answer from setup_status, which decides what is ticked. */
let readiness = null;
/** Called after the config is written, so the rest of the window catches up. */
let onSaved = async () => {};
/** Whether .env already carries a network token, which decides whether to mint one. */
let hasAgentToken = false;

const sheet = () => $("onboarding");
const steps = () => [...document.querySelectorAll("#onboarding .step")];

export function open() {
  sheet().classList.remove("hidden");
  void refresh();
}

export function close() {
  sheet().classList.add("hidden");
}

/** Asks the Rust side what is in place, and redraws around the answer. */
export async function refresh() {
  readiness = await invoke("setup_status");

  $("ob-dir").value = readiness.agentDir ?? "";
  $("ob-node").value = readiness.nodePath ?? "";

  const list = $("ob-candidates");
  list.innerHTML = "";
  for (const candidate of readiness.candidates) {
    const option = document.createElement("option");
    option.value = candidate;
    list.append(option);
  }

  $("ob-where").textContent = readiness.agentDirOk
    ? readiness.nodeOk
      ? `Found the agent, and node ${readiness.nodeVersion}.`
      : readiness.nodeVersion
        ? `node ${readiness.nodeVersion} is too old. The agent needs 22 or newer to run TypeScript without a build step.`
        : "That node did not answer. Point it at one, or install step 2 will find one for you."
    : readiness.candidates.length
      ? "That is not an agent directory. Pick one of the suggestions."
      : "No agent checkout found. Clone the home-assistant repository and give the path to its agent directory.";

  paintChecks();
  markDone();
  await loadAnswers();

  // Nobody should have to know to press a button for this. ffmpeg is what
  // opens the device, so there is nothing to ask with until it is installed,
  // and after the first yes this is a silent quarter of a second.
  if (readiness.ffmpeg && micGranted === undefined) void askForMicrophone();
}

function paintChecks() {
  const rows = [
    ["Agent", readiness.agentDirOk, readiness.agentDir || "not set"],
    ["Node", readiness.nodeOk, readiness.nodeVersion ?? "not found"],
    ["Homebrew", readiness.homebrew, readiness.homebrew ? "installed" : "not installed, so nothing can be installed for you"],
    ["Packages", readiness.packages, readiness.packages ? "installed" : "not installed yet"],
    ["Models", readiness.models, readiness.models ? "downloaded" : "about 500 MB, downloaded once"],
    ["ffmpeg", readiness.ffmpeg, readiness.ffmpeg ? "installed" : "no ffmpeg means no microphone"],
    ["whisper", readiness.whisper, readiness.whisper ? "installed" : "no speech to text without it"],
    ["Config", readiness.config, readiness.config ? "agent.config.json" : "written by the install below"],
  ];

  const list = $("ob-checks");
  list.innerHTML = "";
  for (const [name, ok, detail] of rows) {
    const item = document.createElement("li");
    item.innerHTML = '<span class="mark"></span><span class="name"></span><span class="detail"></span>';
    item.querySelector(".mark").className = `mark ${ok ? "ok" : "warn"}`;
    item.querySelector(".mark").textContent = ok ? "✓" : "!";
    item.querySelector(".name").textContent = name;
    item.querySelector(".detail").textContent = detail;
    list.append(item);
  }
}

function markDone() {
  const [where, install] = steps();
  where.classList.toggle("done", readiness.agentDirOk && readiness.nodeOk);
  install.classList.toggle("done", readiness.installed);
}

// ------------------------------------------------------------------ step one

for (const id of ["ob-dir", "ob-node"]) {
  // Retyping a path should say straight away whether it was the right one.
  $(id).addEventListener("change", async () => {
    await invoke("set_settings", {
      next: { agentDir: $("ob-dir").value.trim(), nodePath: $("ob-node").value.trim() },
    });
    await refresh();
  });
}

// ------------------------------------------------------------------ step two

$("ob-run").addEventListener("click", async () => {
  const button = $("ob-run");
  const note = $("ob-run-note");
  const log = $("ob-log");

  await invoke("set_settings", {
    next: { agentDir: $("ob-dir").value.trim(), nodePath: $("ob-node").value.trim() },
  });

  button.disabled = true;
  log.textContent = "";
  log.classList.remove("hidden");
  note.textContent = "Working. The models are a few hundred megabytes, so this takes a while.";

  try {
    const ok = await invoke("run_setup", { wakeWord: $("ob-wake").value });
    note.textContent = ok ? "Done." : "Finished, with the failures above still to fix.";
  } catch (error) {
    note.textContent = String(error);
  } finally {
    button.disabled = false;
    await refresh();
  }
});

await listen("setup://event", ({ payload }) => {
  const log = $("ob-log");
  const prefix = { step: "\n", fail: "  ✗ ", warn: "  ! ", ok: "  ✓ ", done: "\n" }[payload.kind] ?? "    ";
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
  log.textContent += `${prefix}${payload.text}\n`;
  if (atBottom) log.scrollTop = log.scrollHeight;

  if (payload.kind === "step") $("ob-run-note").textContent = payload.text;
});

// ---------------------------------------------------------------- step three

/** Fills the answers from whatever is already configured. */
async function loadAnswers() {
  let config = {};
  try {
    config = JSON.parse(await invoke("read_agent_config"));
  } catch {
    // No config yet is the normal first run state.
  }

  $("ob-ha-url").value = config.homeAssistant?.baseUrl ?? "http://homeassistant.home:8123";
  $("ob-wake").value = config.wake?.words?.[0] ?? "hey_jarvis";

  const present = await invoke("secrets_present");
  $("ob-ha-token").placeholder = present.haToken ? "set, leave blank to keep" : "not set";
  $("ob-anthropic").placeholder = present.anthropicKey ? "set, leave blank to keep" : "not set";
  hasAgentToken = present.agentToken;
  $("ob-network").checked = hasAgentToken;

  await loadMics(config.audio?.inputDevice ?? ":0");

  const [, , answers] = steps();
  answers.classList.toggle("done", present.haToken && micGranted === true);
}

async function loadMics(current) {
  const select = $("ob-mic");
  select.innerHTML = "";
  let devices = [];
  try {
    devices = await invoke("audio_devices");
  } catch {
    // ffmpeg is what lists them, and it may not be installed yet.
  }

  const options = devices.map((device) => ({
    value: device.match(/^\[(\d+)\]/) ? `:${device.match(/^\[(\d+)\]/)[1]}` : current,
    label: device,
  }));
  if (!options.some((option) => option.value === current)) {
    options.unshift({ value: current, label: `${current}, the default microphone` });
  }
  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  }
  select.value = current;
}

// ------------------------------------------------------- microphone permission

/** Undefined until it has been asked, because asking is what shows the prompt. */
let micGranted;

function paintMic(state) {
  const row = $("ob-mic-state").querySelector("li");
  const mark = row.querySelector(".mark");
  mark.className = `mark ${state.granted ? "ok" : state.asked ? "bad" : "warn"}`;
  mark.textContent = state.granted ? "✓" : state.asked ? "✗" : "!";
  row.querySelector(".detail").textContent = state.detail;
  $("ob-mic-settings").classList.toggle("hidden", !state.asked || state.granted);
}

async function askForMicrophone() {
  const button = $("ob-mic-ask");
  button.disabled = true;
  paintMic({ granted: false, asked: false, detail: "Asking. Answer the prompt macOS puts up." });
  try {
    const result = await invoke("microphone_check", { device: $("ob-mic").value });
    micGranted = result.granted;
    paintMic({ granted: result.granted, asked: true, detail: result.detail });
  } catch (error) {
    micGranted = false;
    paintMic({ granted: false, asked: true, detail: String(error) });
  } finally {
    button.disabled = false;
    markMicDone();
  }
}

$("ob-mic-ask").addEventListener("click", askForMicrophone);

// A different microphone is a different question only in so far as the device
// has to open; the permission itself is the app's.
$("ob-mic").addEventListener("change", askForMicrophone);

$("ob-mic-settings").addEventListener("click", () => invoke("open_privacy_settings"));

function markMicDone() {
  const [, , answers] = steps();
  answers.classList.toggle("done", answers.classList.contains("done") && micGranted === true);
}

$("ob-save").addEventListener("click", async () => {
  const note = $("ob-save-note");
  try {
    const config = JSON.parse(await invoke("read_agent_config"));
    config.homeAssistant ??= {};
    config.audio ??= {};
    config.wake ??= {};
    config.llm ??= {};
    config.llm.cloud ??= {};

    config.homeAssistant.baseUrl = $("ob-ha-url").value.trim();
    config.audio.inputDevice = $("ob-mic").value;
    config.wake.words = [$("ob-wake").value];
    // Nothing to escalate to without a key, and a cloud model that cannot be
    // reached is a slow way to fail.
    const anthropic = $("ob-anthropic").value;
    if (anthropic) config.llm.cloud.enabled = true;

    await invoke("write_agent_config", { json: JSON.stringify(config) });
    await invoke("write_secrets", {
      haToken: $("ob-ha-token").value || null,
      anthropicKey: anthropic || null,
      braveKey: null,
      // Ticking the box mints a token once. Unticking it takes the house back
      // off the network.
      agentToken: agentToken(),
    });

    $("ob-ha-token").value = "";
    $("ob-anthropic").value = "";
    note.textContent = "Saved.";
    await onSaved();
    await refresh();
  } catch (error) {
    note.textContent = String(error);
  }
});

/** null leaves it alone, "" takes it away, anything else is a new one. */
function agentToken() {
  if (!$("ob-network").checked) return hasAgentToken ? "" : null;
  // Minting a second one would lock out every phone and satellite already
  // holding the first.
  if (hasAgentToken) return null;
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ----------------------------------------------------------------- step four

$("ob-check").addEventListener("click", async () => {
  const list = $("ob-doctor");
  list.innerHTML = '<li class="muted">Checking...</li>';
  try {
    const checks = await invoke("run_doctor");
    list.innerHTML = "";
    for (const check of checks) {
      const item = document.createElement("li");
      item.innerHTML = '<span class="mark"></span><span class="name"></span><span class="detail"></span>';
      item.querySelector(".mark").className = `mark ${check.ok ? "ok" : check.required ? "bad" : "warn"}`;
      item.querySelector(".mark").textContent = check.ok ? "✓" : check.required ? "✗" : "!";
      item.querySelector(".name").textContent = check.name;
      item.querySelector(".detail").textContent = check.detail;
      list.append(item);
    }
  } catch (error) {
    list.innerHTML = "";
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = `Could not run the check: ${error}`;
    list.append(item);
  }
});

$("ob-start").addEventListener("click", async () => {
  try {
    await invoke("start_agent");
    close();
  } catch (error) {
    $("ob-doctor").innerHTML = "";
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = String(error);
    $("ob-doctor").append(item);
  }
});

$("ob-close").addEventListener("click", close);

/**
 * Opens itself when there is something still to do, which on a fresh machine is
 * everything. Once the agent is set up this never appears again unless it is
 * asked for from Settings.
 */
export async function init(afterSave) {
  onSaved = afterSave;
  await refresh();
  if (!readiness.installed) sheet().classList.remove("hidden");
}
