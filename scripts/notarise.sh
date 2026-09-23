#!/usr/bin/env bash
#
# Notarise and staple the dmg, then check what Gatekeeper will check.
#
# Tauri signs, notarises and staples Parlour Server.app on its own, given the Apple
# environment variables, but it only signs the dmg: the disk image someone
# downloads carries no notarisation ticket of its own, and macOS refuses to
# open one. So the app is Tauri's job and the dmg is this script's.
#
# Usage: scripts/notarise.sh [path/to/Parlour Server.dmg]
#
# With no argument it takes the one dmg in the release bundle directory. With
# no Apple credentials in the environment it says so and does nothing, which
# is what a build from a checkout wants.

set -euo pipefail

BUNDLE="apps/desktop/src-tauri/target/release/bundle"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [ $# -gt 0 ]; then
  dmg="$1"
  [ -f "$dmg" ] || { echo "No dmg at $dmg." >&2; exit 1; }
else
  # A glob rather than the version, so this never needs bumping. More than one
  # match means a stale build is still lying about, and stapling the wrong one
  # would be worse than stopping. Counted in a loop rather than held in an
  # array, because the bash macOS ships trips over an empty one under set -u.
  dmg=""
  count=0
  while IFS= read -r line; do
    dmg="$line"
    count=$((count + 1))
  done < <(find "$BUNDLE/dmg" -maxdepth 1 -name "*.dmg" 2>/dev/null | sort)
  if [ "$count" -eq 0 ]; then
    echo "No dmg under $BUNDLE/dmg. Run pnpm -C apps/desktop build first." >&2
    exit 1
  fi
  if [ "$count" -gt 1 ]; then
    echo "More than one dmg under $BUNDLE/dmg:" >&2
    find "$BUNDLE/dmg" -maxdepth 1 -name "*.dmg" | sort >&2
    echo "Clear the old ones out, or name the one you mean." >&2
    exit 1
  fi
fi

# Either set of credentials notarytool takes. The App Store Connect key is
# preferred where both are present: it is scoped to one key rather than to an
# Apple account, and it does not expire when somebody changes their password.
if [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]; then
  credentials=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
elif [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
  credentials=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID")
else
  echo "No Apple credentials in the environment, so $(basename "$dmg") stays unsigned and unnotarised."
  echo "That is fine on the machine that built it. The release workflow sets them."
  exit 0
fi

echo "Notarising $dmg"
# --wait blocks until Apple has an answer, which is usually a minute or two.
# notarytool exits non-zero on a rejection, and the log is the only thing that
# says which file was rejected and why, so it is worth printing before failing.
if ! output="$(xcrun notarytool submit "$dmg" "${credentials[@]}" --wait --timeout 30m 2>&1)"; then
  echo "$output" >&2
  id="$(printf '%s\n' "$output" | awk '/^ *id: /{print $2; exit}')"
  if [ -n "$id" ]; then
    echo "Notarisation log for $id:" >&2
    xcrun notarytool log "$id" "${credentials[@]}" >&2 || true
  fi
  exit 1
fi
echo "$output"

# Stapling writes the ticket into the dmg, so the first person to open it does
# not need to be online for Gatekeeper to make up its mind.
echo "Stapling"
xcrun stapler staple "$dmg"

echo "Checking what Gatekeeper checks"
# The dmg, as it arrives: a valid signature, a ticket attached to it, and the
# verdict macOS gives an image it has just downloaded.
codesign --verify --strict --verbose=2 "$dmg"
xcrun stapler validate "$dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"

# And the app inside it, which is the thing that has to launch afterwards.
# The || true keeps a missing directory from ending the script: the dmg is
# what ships, and the app is a second opinion on it.
app="$(find "$BUNDLE/macos" -maxdepth 1 -name "*.app" 2>/dev/null | head -1 || true)"
if [ -n "$app" ]; then
  codesign --verify --deep --strict --verbose=2 "$app"
  xcrun stapler validate "$app"
  spctl --assess --type execute --verbose=2 "$app"

  # The hardened runtime is what notarisation is conditional on, and the
  # microphone entitlement is what makes the app worth launching once it is
  # through. Both are read from the signature rather than from the files that
  # were meant to produce it, because that is where they either are or are not.
  # Captured first: piping into grep -q closes the pipe early, and under
  # pipefail a signing tool cut off mid-sentence would read as a failure.
  signature="$(codesign --display --verbose=2 "$app" 2>&1)"
  case "$signature" in
    *flags=*runtime*) ;;
    *) echo "$app is signed without the hardened runtime." >&2; exit 1 ;;
  esac
  entitlements="$(codesign --display --entitlements - "$app" 2>/dev/null || true)"
  case "$entitlements" in
    *com.apple.security.device.audio-input*) ;;
    *) echo "$app carries no microphone entitlement; it will not hear anything." >&2; exit 1 ;;
  esac
fi

echo "$(basename "$dmg") is signed, notarised and stapled."
