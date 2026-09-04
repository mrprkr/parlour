// The window is a thin face on the Rust side: every capability lives there,
// and this file only reads state and posts edits back.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);
const form = $("form");

/** The agent's own config, kept as a parsed object between load and save. */
let agentConfig = {};

// ------------------------------------------------------------------ status

function paint(status) {
  $("dot").className = `dot ${status.state || "stopped"}`;
  $("state").textContent = status.state || "stopped";
  $("power").textContent = status.running ? "Stop" : "Start";
  $("tools").textContent = status.running ? String(status.tools ?? 0) : "-";
  $("cloud").textContent = status.running ? (status.cloud ? "on" : "off") : "-";

  if (status.lastHeard) $("heard").textContent = `"${status.lastHeard}"`;
  if (status.lastReply) $("reply").textContent = `"${status.lastReply}"`;

  const via = $("via");
  if (status.via) {
    via.textContent = status.via;
    via.className = `badge ${status.via === "cloud" ? "cloud" : ""}`;
  } else {
    via.className = "badge hidden";
  }

  if (status.error) appendLog(`error: ${status.error}`);
}

$("power").addEventListener("click", async () => {
  const status = await invoke("status");
  try {
    await invoke(status.running ? "stop_agent" : "start_agent");
  } catch (error) {
    appendLog(String(error));
    switchTab("logs");
  }
  paint(await invoke("status"));
});

// ------------------------------------------------------------------- doctor

$("check").addEventListener("click", async () => {
  const list = $("checks");
  list.innerHTML = '<li class="muted">Checking...</li>';
  try {
    const checks = await invoke("run_doctor");
    list.innerHTML = "";
    for (const check of checks) {
      const mark = check.ok ? "ok" : check.required ? "bad" : "warn";
      const glyph = check.ok ? "✓" : check.required ? "✗" : "!";
      const item = document.createElement("li");
      item.innerHTML =
        `<span class="mark ${mark}"></span><span class="name"></span><span class="detail"></span>`;
      item.querySelector(".mark").textContent = glyph;
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

// ---------------------------------------------------------------- connectors

async function loadNetwork() {
  try {
    const net = await invoke("network");
    $("network-url").textContent = net.url;
    $("network-note").textContent = net.tokenSet
      ? "Phones open that address. Home Assistant points at it with /v1 on the end."
      : "No AGENT_TOKEN is set, so the agent only answers this machine. Add one in Settings to let the house in.";
  } catch (error) {
    $("network-url").textContent = String(error);
  }
}

async function loadConnectors() {
  const list = $("connector-list");
  try {
    const connectors = await invoke("connectors");
    list.innerHTML = "";
    if (!connectors.length) {
      list.innerHTML = '<li class="muted">Nothing connected yet.</li>';
      return;
    }
    for (const connector of connectors) {
      const item = document.createElement("li");
      item.innerHTML =
        '<span class="mark"></span><span class="name"></span>' +
        '<span class="detail"></span><button class="ghost" type="button">Remove</button>';
      item.querySelector(".mark").className = `mark ${connector.signedIn ? "ok" : "bad"}`;
      item.querySelector(".mark").textContent = connector.signedIn ? "✓" : "✗";
      item.querySelector(".name").textContent = connector.name;
      item.querySelector(".detail").textContent = connector.signedIn
        ? connector.url
        : `${connector.url}, signed out. Connect it again.`;
      item.querySelector("button").addEventListener("click", async () => {
        await invoke("connector_remove", { name: connector.name });
        await loadConnectors();
      });
      list.append(item);
    }
  } catch (error) {
    list.innerHTML = "";
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = String(error);
    list.append(item);
  }
}

$("connector-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const status = $("connector-status");
  try {
    await invoke("connector_add", {
      name: form.name.value.trim(),
      url: form.url.value.trim(),
      scope: form.scope.value.trim() || null,
    });
    status.textContent = "Finish the sign in in your browser, then refresh.";
    form.reset();
    // The browser round trip takes as long as it takes; check back rather than
    // pretending to know when someone has finished typing a password.
    setTimeout(loadConnectors, 8000);
  } catch (error) {
    status.textContent = String(error);
  }
});

// ------------------------------------------------------------------ settings

async function loadSettings() {
  const settings = await invoke("get_settings");
  form.agentDir.value = settings.agentDir ?? "";
  form.nodePath.value = settings.nodePath ?? "";

  try {
    agentConfig = JSON.parse(await invoke("read_agent_config"));
  } catch (error) {
    appendLog(`could not read agent.config.json: ${error}`);
    agentConfig = {};
  }

  const audio = (agentConfig.audio ??= {});
  const wake = (agentConfig.wake ??= {});
  const tts = (agentConfig.tts ??= {});
  const llm = (agentConfig.llm ??= {});
  const local = (llm.local ??= {});
  const cloud = (llm.cloud ??= {});
  const house = (agentConfig.homeAssistant ??= {});

  form.wakeWord.value = wake.words?.[0] ?? "hey_jarvis";
  form.wakeThreshold.value = wake.threshold ?? 0.5;
  form.silenceMs.value = audio.silenceMs ?? 800;
  form.voice.value = tts.voice ?? "bf_emma";
  form.localBaseUrl.value = local.baseUrl ?? "http://127.0.0.1:1234/v1";
  form.localModel.value = local.model ?? "";
  form.cloudEnabled.checked = cloud.enabled !== false;
  form.cloudModel.value = cloud.model ?? "claude-opus-5";
  form.haBaseUrl.value = house.baseUrl ?? "";
  showThreshold();

  await loadDevices(audio.inputDevice ?? ":0");

  const present = await invoke("secrets_present");
  form.haToken.placeholder = present.haToken ? "set, leave blank to keep" : "not set";
  form.anthropicKey.placeholder = present.anthropicKey ? "set, leave blank to keep" : "not set";
  form.agentToken.placeholder = present.agentToken ? "set, leave blank to keep" : "not set, so nothing on the network can reach it";
}

/** ffmpeg names devices by index, which is what the agent wants. */
async function loadDevices(current) {
  const select = $("inputDevice");
  select.innerHTML = "";
  const devices = await invoke("audio_devices");
  const options = devices.map((device) => {
    const index = device.match(/^\[(\d+)\]/)?.[1];
    return { value: index ? `:${index}` : current, label: device };
  });
  if (!options.some((option) => option.value === current)) {
    options.unshift({ value: current, label: `${current} (current)` });
  }
  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  }
  select.value = current;
}

function showThreshold() {
  $("wakeThresholdOut").textContent = Number(form.wakeThreshold.value).toFixed(2);
}
form.wakeThreshold.addEventListener("input", showThreshold);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  agentConfig.audio.inputDevice = form.inputDevice.value;
  agentConfig.audio.silenceMs = Number(form.silenceMs.value);
  agentConfig.wake.words = [form.wakeWord.value];
  agentConfig.wake.threshold = Number(form.wakeThreshold.value);
  agentConfig.tts.voice = form.voice.value;
  agentConfig.llm.local.baseUrl = form.localBaseUrl.value.trim();
  agentConfig.llm.local.model = form.localModel.value.trim();
  agentConfig.llm.cloud.enabled = form.cloudEnabled.checked;
  agentConfig.llm.cloud.model = form.cloudModel.value.trim();
  agentConfig.homeAssistant.baseUrl = form.haBaseUrl.value.trim();

  try {
    await invoke("set_settings", {
      next: { agentDir: form.agentDir.value.trim(), nodePath: form.nodePath.value.trim() },
    });
    await invoke("write_agent_config", { json: JSON.stringify(agentConfig) });
    // An empty box means "leave it alone", so only send what was typed.
    await invoke("write_secrets", {
      haToken: form.haToken.value || null,
      anthropicKey: form.anthropicKey.value || null,
      braveKey: null,
      agentToken: form.agentToken.value || null,
    });
    form.haToken.value = "";
    form.anthropicKey.value = "";
    form.agentToken.value = "";
    flash("Saved.");
    await loadSettings();
    await loadNetwork();
  } catch (error) {
    flash(String(error));
  }
});

function flash(message) {
  const saved = $("saved");
  saved.textContent = message;
  setTimeout(() => (saved.textContent = ""), 4000);
}

// ---------------------------------------------------------------------- logs

function appendLog(line) {
  const log = $("log");
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
  log.textContent += `${line}\n`;
  if (atBottom) log.scrollTop = log.scrollHeight;
}

// ---------------------------------------------------------------------- tabs

function switchTab(name) {
  if (name === "connectors") void loadConnectors();
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.tab === name);
  }
  for (const panel of document.querySelectorAll(".panel")) {
    panel.classList.toggle("active", panel.id === name);
  }
}
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
}

// --------------------------------------------------------------------- start

await listen("agent://status", (event) => paint(event.payload));
await listen("agent://log", (event) => appendLog(event.payload));
await listen("agent://error", (event) => {
  appendLog(String(event.payload));
  switchTab("logs");
});

$("log").textContent = (await invoke("logs")).join("\n");
paint(await invoke("status"));
await loadSettings();
await loadNetwork();
