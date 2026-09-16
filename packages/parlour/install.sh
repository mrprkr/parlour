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

# ------------------------------------------------------------------- the role

step "What this machine is"
echo "    One box in the house runs the models and answers. Everything else"
echo "    with a microphone is a satellite: it streams to that box and plays"
echo "    back what it says. A satellite needs no models, no keys and no GPU."
EXISTING_ROLE="server"
if [ -f agent.config.json ]; then
  EXISTING_ROLE="$(node -p "require('./agent.config.json').role||'server'" 2>/dev/null || echo server)"
fi
ROLE="$(ask "server or satellite" "$EXISTING_ROLE")"
case "$ROLE" in
  server | satellite) ;;
  *) fail "That is not a role. It is \"server\" or \"satellite\"." ;;
esac

ROOM=""
if [ "$ROLE" = "satellite" ]; then
  ROOM="$(ask "Which room is it in" "${ROOM:-kitchen}")"
fi

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

# Read once, for both roles: a satellite needs the server's token and nothing
# else, and losing that distinction is how a satellite ends up generating a
# token of its own and never being let in.
EXISTING_HA_URL="http://homeassistant.home:8123"
EXISTING_HA_TOKEN=""
EXISTING_ANTHROPIC=""
EXISTING_AGENT_TOKEN=""
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set +u; . ./.env; set -u
  EXISTING_HA_TOKEN="${HA_TOKEN:-}"
  EXISTING_ANTHROPIC="${ANTHROPIC_API_KEY:-}"
  EXISTING_AGENT_TOKEN="${AGENT_TOKEN:-}"
fi
if [ -f agent.config.json ]; then
  EXISTING_HA_URL="$(node -p "(require('./agent.config.json').homeAssistant||{}).baseUrl||'$EXISTING_HA_URL'")"
fi

HA_URL="$EXISTING_HA_URL"
HA_TOKEN_VALUE=""
ANTHROPIC_VALUE=""
SERVER_URL=""

if [ "$ROLE" = "satellite" ]; then
  step "The server"
  echo "    A satellite finds the server with Bonjour, so all it needs is the"
  echo "    same access token the server was given. Leave the address blank"
  echo "    unless this network does not carry multicast."
  SERVER_URL="$(ask "Server address, or blank to find it automatically" "")"
  AGENT_TOKEN_VALUE="$(secret "The server's access token" "$EXISTING_AGENT_TOKEN")"
  if [ -z "$AGENT_TOKEN_VALUE" ]; then
    warn "Without it the server will refuse this satellite."
  fi
else
  step "Home Assistant"
  echo "    A long lived access token: your profile page in Home Assistant,"
  echo "    Security tab, right at the bottom. It is the whole house, so it goes"
  echo "    in .env and never into git."
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
  echo "    The agent listens on the network so that Home Assistant, a phone or"
  echo "    a satellite can all reach it. That needs a shared token, or it"
  echo "    answers this machine only."
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
fi

# ---------------------------------------------------------------------- voice

step "Voice"

# Both roles need a microphone. Only the server needs a wake word, a speaking
# voice and a model: a satellite streams what it hears and plays back what it
# is sent.
if have ffmpeg; then
  echo "    Audio inputs:"
  ffmpeg -f avfoundation -list_devices true -i "" 2>&1 |
    sed -n 's/^\[AVFoundation[^]]*\] \(\[[0-9]*\].*\)/      \1/p' || true
fi
INPUT_DEVICE="$(ask "Input device (\":0\" is the default microphone)" ":0")"

WAKE_WORD="hey_jarvis"
VOICE="bf_emma"
LOCAL_MODEL=""
if [ "$ROLE" = "server" ]; then
  WAKE_WORD="$(ask "Wake word (hey_jarvis, alexa, hey_mycroft)" "$WAKE_WORD")"
  if [ ! -f "models/openwakeword/$WAKE_WORD.onnx" ]; then
    warn "No model for $WAKE_WORD. Fetching it."
    WAKE_WORDS="$WAKE_WORD" sh scripts/fetch-models.sh
  fi
  VOICE="$(ask "Speaking voice (bf_emma, bf_isabella, bm_george, bm_lewis)" "$VOICE")"
  LOCAL_MODEL="$(ask "Local model id, as LM Studio reports it" "qwen3-8b-mlx")"
fi

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
    ROLE="$ROLE" ROOM="$ROOM" SERVER_URL="${SERVER_URL:-}" \
    node -e '
      const fs = require("node:fs");
      const base = JSON.parse(fs.readFileSync("agent.config.example.json", "utf8"));
      base.audio.inputDevice = process.env.INPUT_DEVICE;
      base.wake.words = [process.env.WAKE_WORD];
      base.tts.voice = process.env.VOICE;
      base.llm.local.model = process.env.LOCAL_MODEL;
      base.llm.cloud.enabled = process.env.CLOUD_ENABLED === "true";
      base.homeAssistant.baseUrl = process.env.HA_URL;
      base.role = process.env.ROLE;
      base.satellite = {
        serverUrl: process.env.SERVER_URL || "",
        room: process.env.ROOM || "",
        localWake: false,
      };
      // The example carries a placeholder MCP server to show the shape. A real
      // config should start with none rather than one that cannot start.
      base.mcpServers = {};
      fs.writeFileSync("agent.config.json", JSON.stringify(base, null, 2) + "\n");
    '
  echo "    agent.config.json"
fi

# ------------------------------------------------------------------ services

step "Running it"
echo "    launchd starts it at login and restarts it if it falls over."
echo "    The plists come from src/service.ts, which is also what"
echo "    pnpm service status reads."

if [ "$ROLE" = "satellite" ] || confirm "Run the agent at login? Say no if you want the menu bar app to own it."; then
  node --experimental-strip-types --env-file-if-exists=.env src/service.ts install |
    sed 's/^/    /'
  warn "The first run asks for the microphone. Approve it, or it hears nothing."
else
  node --experimental-strip-types --env-file-if-exists=.env src/service.ts install --only=whisper |
    sed 's/^/    /'
  echo "    the agent itself is left to the app"
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
  if [ "$ROLE" = "satellite" ]; then
    bold "Ready. It will find the server and stay connected to it."
  else
    bold "Ready. Say \"${WAKE_WORD//_/ }\"."
  fi
else
  bold "Set up, with the failures above still to fix."
fi

if [ "$ROLE" = "server" ] && [ -n "$AGENT_TOKEN_VALUE" ]; then
  PORT="$(node -p "(require('./agent.config.json').server||{}).port||8765" 2>/dev/null || echo 8765)"
  echo
  bold "The rest of the house"
  echo "    Phones:          http://$(hostname):$PORT"
  echo "    Home Assistant:  http://$(hostname):$PORT/v1  (OpenAI Conversation integration)"
  echo "    Satellites:      nothing to type. They find this machine by name."
  echo "    The token is in .env as AGENT_TOKEN. Satellites need the same one."
elif [ "$ROLE" = "satellite" ]; then
  echo
  bold "This satellite"
  echo "    Room:            ${ROOM:-not set}"
  echo "    Server:          ${SERVER_URL:-found automatically}"
fi

echo
echo "    pnpm service status   is it running, and does it start at login"
echo "    pnpm service logs     what it has been saying"
echo "    pnpm run doctor       check again"
if [ "$ROLE" = "server" ]; then
  echo "    pnpm text             try it without the microphone"
  echo "    desktop/              the menu bar app, if you want a face on it"
fi
