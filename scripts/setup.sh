#!/usr/bin/env bash
#
# Everything the agent needs that nobody has to be asked about: the tools, the
# packages, the models, and whisper kept warm. It asks nothing and it overwrites
# nothing, so it is safe to run again and safe to run from a button in the app.
#
# The questions live elsewhere. `install.sh` asks them in a terminal, the menu
# bar app asks them in its onboarding, and both call this for the mechanics.
#
#   bash scripts/setup.sh                do the lot
#   bash scripts/setup.sh --porcelain    one machine readable line per event
#   bash scripts/setup.sh --no-deps      never touch Homebrew
#   bash scripts/setup.sh --no-config    leave .env and agent.config.json alone
#   bash scripts/setup.sh --no-whisper   do not write the whisper LaunchAgent
set -uo pipefail

cd "$(dirname "$0")/.."
AGENT_DIR="$(pwd)"

PORCELAIN=false
SKIP_DEPS=false
SKIP_CONFIG=false
SKIP_WHISPER=false

for arg in "$@"; do
  case "$arg" in
    --porcelain) PORCELAIN=true ;;
    --no-deps) SKIP_DEPS=true ;;
    --no-config) SKIP_CONFIG=true ;;
    --no-whisper) SKIP_WHISPER=true ;;
    --help | -h) sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# A bundled app and a LaunchAgent both start with a bare PATH, so the usual
# places have to be put back before anything is looked for. NODE_PATH_HINT is
# how the app passes down the node it already knows about.
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -n "${NODE_PATH_HINT:-}" ] && [ -x "${NODE_PATH_HINT:-}" ]; then
  PATH="$(dirname "$NODE_PATH_HINT"):$PATH"
fi
export PATH

FAILED=0

# One event per line when the app is listening, and something readable when a
# person is. Everything below reports through these four.
step() { if $PORCELAIN; then echo "step $1"; else printf '\n\033[1m==> %s\033[0m\n' "$1"; fi; }
ok()   { if $PORCELAIN; then echo "ok $1";   else printf '    %s\n' "$1"; fi; }
warn() { if $PORCELAIN; then echo "warn $1"; else printf '\033[33m    %s\033[0m\n' "$1"; fi; }
fail() { FAILED=1; if $PORCELAIN; then echo "fail $1"; else printf '\033[31m    %s\033[0m\n' "$1" >&2; fi; }

# Runs a command with its output folded into the stream rather than swallowed,
# because a five minute `pnpm install` with nothing on screen looks like a hang.
run() {
  if $PORCELAIN; then
    "$@" 2>&1 | sed 's/^/log /'
  else
    "$@" 2>&1 | sed 's/^/    /'
  fi
  return "${PIPESTATUS[0]}"
}

have() { command -v "$1" >/dev/null 2>&1; }

if [ "$(uname -s)" != "Darwin" ]; then
  fail "This sets up a Mac. You are on $(uname -s)."
  echo "done 1"
  exit 1
fi

# --------------------------------------------------------------------- tools

step "Tools"
if $SKIP_DEPS; then
  ok "skipping Homebrew"
elif ! have brew; then
  warn "Homebrew is not installed, so nothing can be installed for you."
  warn "Install it from https://brew.sh, then run this again."
else
  for formula in node ffmpeg whisper-cpp; do
    if brew list --formula "$formula" >/dev/null 2>&1; then
      ok "have $formula"
    else
      ok "installing $formula"
      run brew install "$formula" || fail "could not install $formula"
    fi
  done
fi

if ! have node; then
  fail "node is not installed. It is what the agent runs on."
elif [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  fail "node 22 or newer is needed for type stripping. Found $(node -v)."
else
  ok "node $(node -v)"
fi

have ffmpeg && ok "ffmpeg" || fail "ffmpeg is missing. Without it there is no microphone."
have whisper-server && ok "whisper-server" || warn "whisper-server is missing, so there is no speech to text."

# --------------------------------------------------------------------- pnpm

step "Packages"
if ! have pnpm; then
  corepack enable >/dev/null 2>&1 || npm install -g pnpm >/dev/null 2>&1
fi

if have pnpm && have node; then
  # There is no terminal to answer on when the app runs this, and pnpm would
  # rather abort than clear a stale node_modules unasked.
  run pnpm install --config.confirmModulesPurge=false && ok "installed" || fail "pnpm install failed"
else
  fail "no pnpm, so the packages cannot be installed"
fi

# -------------------------------------------------------------------- models

step "Models"
if [ -f models/openwakeword/melspectrogram.onnx ] && ls models/whisper/*.bin >/dev/null 2>&1; then
  ok "already downloaded"
else
  run sh scripts/fetch-models.sh && ok "downloaded" || fail "could not download the models"
fi

# For a wake word the app picked after the first run, which the fetch above
# would not have known to get.
if [ -n "${WAKE_WORDS:-}" ]; then
  for word in $WAKE_WORDS; do
    if [ ! -f "models/openwakeword/$word.onnx" ]; then
      run env WAKE_WORDS="$word" sh scripts/fetch-models.sh || fail "could not fetch the $word model"
    fi
  done
fi

# -------------------------------------------------------------------- config

if $SKIP_CONFIG; then
  :
else
  step "Configuration"

  # Created empty rather than filled in: the answers come from the installer or
  # the app, and an existing file is never touched.
  if [ -f .env ]; then
    ok ".env is already there"
  else
    umask 077
    cat > .env <<'ENV'
# Secrets only. Everything else is in agent.config.json.
HA_TOKEN=
ANTHROPIC_API_KEY=
AGENT_TOKEN=
BRAVE_API_KEY=
LOG_LEVEL=info
ENV
    chmod 600 .env
    ok "wrote .env"
  fi

  if [ -f agent.config.json ]; then
    ok "agent.config.json is already there"
  elif have node; then
    node -e '
      const fs = require("node:fs");
      const base = JSON.parse(fs.readFileSync("agent.config.example.json", "utf8"));
      // The example carries a placeholder MCP server to show the shape. A real
      // config starts with none rather than one that cannot start.
      base.mcpServers = {};
      fs.writeFileSync("agent.config.json", JSON.stringify(base, null, 2) + "\n");
    ' && ok "wrote agent.config.json" || fail "could not write agent.config.json"
  else
    fail "no node, so agent.config.json cannot be written"
  fi
fi

# ------------------------------------------------------------------- whisper

# One place knows how to write a LaunchAgent, and it is src/service.ts. This
# used to be a heredoc here and a second one in install.sh, which is exactly
# how two machines end up with services that differ in ways nobody can see.
# Only whisper is installed here: whether the agent itself runs as a service
# or under the app is a question, and this script does not ask questions.
if $SKIP_WHISPER; then
  :
else
  step "Speech to text"
  if [ "$(uname -s)" != "Darwin" ]; then
    warn "launchd is a Mac thing, so whisper was not set up to start at login."
  else
    SERVICE_OUT="$(node --experimental-strip-types --env-file-if-exists=.env \
      src/service.ts install --only=whisper 2>&1)" && SERVICE_OK=0 || SERVICE_OK=1
    if [ $SERVICE_OK -eq 0 ]; then
      printf '%s\n' "$SERVICE_OUT" | while IFS= read -r line; do [ -n "$line" ] && ok "$line"; done
    else
      warn "could not install whisper: $(printf '%s' "$SERVICE_OUT" | tail -1)"
    fi
  fi
fi

# ----------------------------------------------------------------- the app

step "The app"
# Written whether or not the app is installed, so that installing it later
# opens it already pointed at this directory.
SUPPORT="$HOME/Library/Application Support/io.stuntdouble.home-agent"
mkdir -p "$SUPPORT"
NODE_BIN="$(command -v node || echo node)"
cat > "$SUPPORT/settings.json" <<SETTINGS
{
  "agentDir": "$AGENT_DIR",
  "nodePath": "$NODE_BIN"
}
SETTINGS
ok "pointed at $AGENT_DIR"

echo "done $FAILED"
exit "$FAILED"
