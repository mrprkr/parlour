// Push to talk for a phone, served by the agent itself. No build step, no app
// store, no wake word: a thumb on a button is a better endpoint detector than
// any amount of signal processing, and it means the phone is not listening to
// the room all day.

const $ = (id) => document.getElementById(id);
const store = {
  get: (key, fallback = "") => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private browsing */
    }
  },
};

// A link with the token in it is how the phone gets set up: scan a QR code
// from the desktop app, and the token never has to be typed on a phone.
const params = new URLSearchParams(location.search);
for (const key of ["token", "room"]) {
  if (params.get(key)) store.set(key, params.get(key));
}
if (params.size) history.replaceState(null, "", location.pathname);

if (!store.get("client")) store.set("client", `phone-${Math.random().toString(36).slice(2, 8)}`);

$("token").value = store.get("token");
$("room").value = store.get("room");
$("settings-toggle").addEventListener("click", () => ($("settings").hidden = !$("settings").hidden));
$("save").addEventListener("click", () => {
  store.set("token", $("token").value.trim());
  store.set("room", $("room").value.trim());
  $("settings").hidden = true;
  status("Saved.");
});

function status(text) {
  $("status").textContent = text;
}

// ------------------------------------------------------------------ recording

let recorder;
let chunks = [];
let recording = false;

async function start() {
  if (recording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
    recorder.addEventListener("stop", () => {
      for (const track of stream.getTracks()) track.stop();
      void send(new Blob(chunks, { type: recorder.mimeType }));
    });
    recorder.start();
    recording = true;
    $("talk").classList.add("recording");
    $("talk-label").textContent = "Listening";
    status("");
  } catch (error) {
    // Safari only grants the microphone over HTTPS or on localhost, which is
    // the usual reason to land here on a phone.
    status(`No microphone: ${error.message}`);
  }
}

function stop() {
  if (!recording) return;
  recording = false;
  $("talk").classList.remove("recording");
  $("talk-label").textContent = "Hold to talk";
  recorder?.stop();
}

async function send(blob) {
  if (blob.size < 2000) {
    status("Too short.");
    return;
  }
  $("talk").disabled = true;
  status("Thinking...");

  const query = new URLSearchParams({ client: store.get("client") });
  if (store.get("room")) query.set("room", store.get("room"));

  try {
    const token = store.get("token");
    const response = await fetch(`voice?${query}`, {
      method: "POST",
      headers: {
        "content-type": blob.type || "application/octet-stream",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: blob,
    });
    if (response.status === 401) throw new Error("the token is wrong or missing");
    if (!response.ok) throw new Error(await response.text());

    const result = await response.json();
    $("heard").textContent = result.heard ? `"${result.heard}"` : "";
    $("reply").textContent = result.reply || "I did not catch that.";
    status(result.via ? `answered by the ${result.via} model` : "");
    if (result.audio) await play(result.audio);
  } catch (error) {
    status(String(error.message ?? error));
  } finally {
    $("talk").disabled = false;
  }
}

function play(base64) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  const audio = new Audio(url);
  return audio.play().finally(() => setTimeout(() => URL.revokeObjectURL(url), 30000));
}

// Pointer events cover mouse, touch and pencil in one path, and the capture
// keeps the release coming to the button even if the thumb slides off it.
const talk = $("talk");
talk.addEventListener("pointerdown", (event) => {
  talk.setPointerCapture(event.pointerId);
  void start();
});
for (const type of ["pointerup", "pointercancel"]) talk.addEventListener(type, stop);
talk.addEventListener("contextmenu", (event) => event.preventDefault());

// Space bar, for anyone who opens this on a laptop.
addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat && event.target === document.body) {
    event.preventDefault();
    void start();
  }
});
addEventListener("keyup", (event) => {
  if (event.code === "Space") stop();
});
