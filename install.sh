#!/usr/bin/env bash
#
# One-shot setup for the home agent on a Mac.
#
# Installs what is missing, downloads the models, asks for the four things it
# cannot work out on its own, and finishes by telling you what is still broken.
# Safe to run again: nothing is overwritten without asking, and every step
# checks before it acts.
#
#   bash install.sh              interactive
#   bash install.sh --yes        accept every default, ask only for secrets
#   bash install.sh --no-deps    skip Homebrew entirely
set -euo pipefail

cd "$(dirname "$0")"
AGENT_DIR="$(pwd)"
ASSUME_YES=false
SKIP_DEPS=false

for arg in "$@"; do
  case "$arg" in
    --yes | -y) ASSUME_YES=true ;;
    --no-deps) SKIP_DEPS=true ;;
    --help | -h) sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    %s\033[0m\n' "$1"; }
fail() { printf '\033[31m    %s\033[0m\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Every prompt funnels through these two, so --yes has one meaning throughout:
# take the default, and only stop for something that has no sensible default.
ask() { # ask "question" "default"
  local answer
  if $ASSUME_YES; then printf '%s' "$2"; return; fi
  read -r -p "    $1 [$2]: " answer </dev/tty || true
  printf '%s' "${answer:-$2}"
}

confirm() { # confirm "question" (default yes)
  local answer
  if $ASSUME_YES; then return 0; fi
  read -r -p "    $1 [Y/n]: " answer </dev/tty || true
  case "$answer" in [nN]*) return 1 ;; *) return 0 ;; esac
}

secret() { # secret "question" "current value"
  local answer
  if [ -n "$2" ]; then
    if $ASSUME_YES || confirm "$1 is already set. Keep it?"; then printf '%s' "$2"; return; fi
  fi
  read -r -s -p "    $1: " answer </dev/tty || true
  printf '\n' >&2
  printf '%s' "$answer"
}

[ "$(uname -s)" = "Darwin" ] || fail "This installs a Mac app on a Mac. You are on $(uname -s)."

bold "Home agent setup"
echo "    $AGENT_DIR"

# ---------------------------------------------------------------- the mechanics

# Everything that needs no answer lives in setup.sh, so that the app's Set up
# button and this installer cannot drift apart. The questions stay here.
step "Tools, packages and models"
SETUP_ARGS=(--no-config)
if $SKIP_DEPS; then SETUP_ARGS+=(--no-deps); fi
bash scripts/setup.sh "${SETUP_ARGS[@]}" || warn "Some of the setup did not finish. The check at the end will say what."

if ! $SKIP_DEPS && have brew; then
  if [ -d "/Applications/LM Studio.app" ]; then
    echo "    have LM Studio"
  elif confirm "Install LM Studio? It is what runs the local model."; then
    brew install --cask lm-studio
  else
    warn "Without it there is no local model, and every question goes to the cloud."
  fi
fi

have node || fail "node is not on PATH."
NODE_BIN="$(command -v node)"

# --------------------------------------------------------------------- secrets

step "Home Assistant"
echo "    A long lived access token: your profile page in Home Assistant,"
echo "    Security tab, right at the bottom. It is the whole house, so it goes"
echo "    in .env and never into git."

EXISTING_HA_URL="http://homeassistant.home:8123"
EXISTING_HA_TOKEN=""
EXISTING_ANTHROPIC=""
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set +u; . ./.env; set -u
  EXISTING_HA_TOKEN="${HA_TOKEN:-}"
  EXISTING_ANTHROPIC="${ANTHROPIC_API_KEY:-}"
fi
if [ -f agent.config.json ]; then
  EXISTING_HA_URL="$(node -p "(require('./agent.config.json').homeAssistant||{}).baseUrl||'$EXISTING_HA_URL'")"
fi

HA_URL="$(ask "Home Assistant address" "$EXISTING_HA_URL")"
HA_TOKEN_VALUE="$(secret "Home Assistant token" "$EXISTING_HA_TOKEN")"

if [ -n "$HA_TOKEN_VALUE" ]; then
  if curl -fsS -m 6 -H "Authorization: Bearer $HA_TOKEN_VALUE" "$HA_URL/api/" >/dev/null 2>&1; then
    echo "    reached $HA_URL"
  else
    warn "Could not reach $HA_URL with that token. Carrying on; pnpm run doctor will say so too."
  fi
fi

step "Cloud escalation"
echo "    The local model hands over anything it is not confident about."
echo "    Leave this empty to run local only."
ANTHROPIC_VALUE="$(secret "Anthropic API key" "$EXISTING_ANTHROPIC")"

step "The rest of the house"
echo "    The agent listens on the network so that Home Assistant, a phone or a"
echo "    satellite can all reach it. That needs a shared token, or it answers"
echo "    this machine only."
EXISTING_AGENT_TOKEN="${AGENT_TOKEN:-}"
if [ -n "$EXISTING_AGENT_TOKEN" ]; then
  AGENT_TOKEN_VALUE="$EXISTING_AGENT_TOKEN"
  echo "    keeping the existing token"
elif confirm "Generate an access token and let the house in?"; then
  AGENT_TOKEN_VALUE="$(openssl rand -hex 24)"
  echo "    generated"
else
  AGENT_TOKEN_VALUE=""
  warn "Loopback only. Re-run this to change your mind."
fi

# ---------------------------------------------------------------------- voice

step "Voice"
WAKE_WORD="$(ask "Wake word (hey_jarvis, alexa, hey_mycroft)" "hey_jarvis")"
if [ ! -f "models/openwakeword/$WAKE_WORD.onnx" ]; then
  warn "No model for $WAKE_WORD. Fetching it."
  WAKE_WORDS="$WAKE_WORD" sh scripts/fetch-models.sh
fi
VOICE="$(ask "Speaking voice (bf_emma, bf_isabella, bm_george, bm_lewis)" "bf_emma")"

if have ffmpeg; then
  echo "    Audio inputs:"
  ffmpeg -f avfoundation -list_devices true -i "" 2>&1 |
    sed -n 's/^\[AVFoundation[^]]*\] \(\[[0-9]*\].*\)/      \1/p' || true
fi
INPUT_DEVICE="$(ask "Input device (\":0\" is the default microphone)" ":0")"

LOCAL_MODEL="$(ask "Local model id, as LM Studio reports it" "qwen3-8b-mlx")"

# ---------------------------------------------------------------------- write

step "Writing configuration"

if [ -f .env ] && ! $ASSUME_YES && ! confirm ".env exists. Overwrite it?"; then
  warn "Keeping the existing .env."
else
  umask 077
  cat > .env <<ENV
# Written by install.sh. Secrets only; everything else is in agent.config.json.
HA_TOKEN=$HA_TOKEN_VALUE
ANTHROPIC_API_KEY=$ANTHROPIC_VALUE
AGENT_TOKEN=$AGENT_TOKEN_VALUE
BRAVE_API_KEY=
LOG_LEVEL=info
ENV
  chmod 600 .env
  echo "    .env"
fi

if [ -f agent.config.json ] && ! $ASSUME_YES && ! confirm "agent.config.json exists. Overwrite it?"; then
  warn "Keeping the existing agent.config.json."
else
  HA_URL="$HA_URL" WAKE_WORD="$WAKE_WORD" VOICE="$VOICE" INPUT_DEVICE="$INPUT_DEVICE" \
    LOCAL_MODEL="$LOCAL_MODEL" CLOUD_ENABLED="$([ -n "$ANTHROPIC_VALUE" ] && echo true || echo false)" \
    node -e '
      const fs = require("node:fs");
      const base = JSON.parse(fs.readFileSync("agent.config.example.json", "utf8"));
      base.audio.inputDevice = process.env.INPUT_DEVICE;
      base.wake.words = [process.env.WAKE_WORD];
      base.tts.voice = process.env.VOICE;
      base.llm.local.model = process.env.LOCAL_MODEL;
      base.llm.cloud.enabled = process.env.CLOUD_ENABLED === "true";
      base.homeAssistant.baseUrl = process.env.HA_URL;
      // The example carries a placeholder MCP server to show the shape. A real
      // config should start with none rather than one that cannot start.
      base.mcpServers = {};
      fs.writeFileSync("agent.config.json", JSON.stringify(base, null, 2) + "\n");
    '
  echo "    agent.config.json"
fi

# ------------------------------------------------------------------- launchd

step "Running it"
echo "    1. From the menu bar app, which starts and stops it for you."
echo "    2. As a background service that starts at login."
echo "    Either way whisper.cpp runs as a service, because it is just a model"
echo "    kept warm."

LAUNCH_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_DIR"

write_plist() { # write_plist label program-args...
  local label="$1"; shift
  local file="$LAUNCH_DIR/$label.plist"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<plist version="1.0">'
    echo '<dict>'
    echo "  <key>Label</key><string>$label</string>"
    echo '  <key>ProgramArguments</key><array>'
    for part in "$@"; do echo "    <string>$part</string>"; done
    echo '  </array>'
    echo "  <key>WorkingDirectory</key><string>$AGENT_DIR</string>"
    echo '  <key>EnvironmentVariables</key><dict>'
    echo "    <key>PATH</key><string>$(dirname "$NODE_BIN"):/usr/bin:/bin:/usr/sbin</string>"
    echo '  </dict>'
    echo '  <key>RunAtLoad</key><true/>'
    echo '  <key>KeepAlive</key><true/>'
    echo "  <key>StandardOutPath</key><string>$HOME/Library/Logs/$label.log</string>"
    echo "  <key>StandardErrorPath</key><string>$HOME/Library/Logs/$label.err</string>"
    echo '</dict>'
    echo '</plist>'
  } > "$file"
  launchctl unload "$file" >/dev/null 2>&1 || true
  launchctl load -w "$file"
  echo "    loaded $label"
}

if confirm "Also run the agent itself at login? Say no if you want the menu bar app to own it."; then
  write_plist io.stuntdouble.home-agent \
    "$NODE_BIN" --experimental-strip-types "--env-file-if-exists=$AGENT_DIR/.env" "$AGENT_DIR/src/index.ts"
  warn "The first time it runs, macOS asks for microphone permission. Approve it, or it hears nothing."
else
  rm -f "$LAUNCH_DIR/io.stuntdouble.home-agent.plist"
  echo "    left to the app"
fi

# ------------------------------------------------------------------ the app

step "Menu bar app"
echo "    pointed at $AGENT_DIR by setup.sh"

if [ -d "/Applications/Home Agent.app" ]; then
  echo "    already installed"
elif ! have cargo; then
  warn "Rust is not installed, so the app cannot be built here."
  warn "curl https://sh.rustup.rs -sSf | sh, then: cd desktop && pnpm install && pnpm build"
elif confirm "Build the menu bar app? It takes a few minutes the first time."; then
  (cd desktop && pnpm install && pnpm build)
  BUILT="$(find desktop/src-tauri/target/release/bundle/macos -maxdepth 1 -name '*.app' 2>/dev/null | head -1)"
  if [ -n "$BUILT" ]; then
    rm -rf "/Applications/Home Agent.app"
    cp -R "$BUILT" /Applications/
    echo "    installed to /Applications"
  else
    warn "The build finished but produced no .app. See the output above."
  fi
else
  echo "    skipped. cd desktop && pnpm build when you want it."
fi

# -------------------------------------------------------------------- verdict

step "Checking"
set +e
pnpm run doctor
DOCTOR=$?
set -e

echo
if [ $DOCTOR -eq 0 ]; then
  bold "Ready. Say \"${WAKE_WORD//_/ }\"."
else
  bold "Set up, with the failures above still to fix."
fi
if [ -n "$AGENT_TOKEN_VALUE" ]; then
  PORT="$(node -p "(require('./agent.config.json').server||{}).port||8765" 2>/dev/null || echo 8765)"
  echo
  bold "The rest of the house"
  echo "    Phones:          http://$(hostname):$PORT"
  echo "    Home Assistant:  http://$(hostname):$PORT/v1  (OpenAI Conversation integration)"
  echo "    The token is in .env as AGENT_TOKEN."
fi

echo
echo "    pnpm text      try it without the microphone"
echo "    pnpm start     run it in the foreground"
echo "    pnpm run doctor    check again"
echo "    desktop/       the menu bar app, if you want a face on it"
