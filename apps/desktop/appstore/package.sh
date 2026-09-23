#!/usr/bin/env bash
#
# Builds the Mac App Store copy of Parlour Server.app, signs it for the sandbox,
# wraps it in the installer package App Store Connect takes, and with
# --upload validates and uploads it.
#
# The dmg is Tauri's job end to end. This build is not, because the App Store
# wants something Tauri does not do: every executable inside the app signed
# with only the sandbox and inherit keys, and the app with its own. So Tauri
# builds the bundle and this script signs it.
#
# Usage: apps/desktop/appstore/package.sh [--upload]
#
# With nothing in the environment it signs ad hoc and stops before the
# package, which gives an app that runs sandboxed on this machine: the way to
# find out what the sandbox refuses before Apple does. For a real build:
#
# | Variable                        | What it is                                                  |
# | ------------------------------- | ----------------------------------------------------------- |
# | APPSTORE_SIGNING_IDENTITY       | "Apple Distribution: Name (TEAMID)", or the older           |
# |                                 | "3rd Party Mac Developer Application: Name (TEAMID)"        |
# | APPSTORE_INSTALLER_IDENTITY     | "3rd Party Mac Developer Installer: Name (TEAMID)"          |
# | APPSTORE_PROVISIONING_PROFILE   | Path to the Mac App Store .provisionprofile for             |
# |                                 | io.parlour.desktop                                          |
# | APPLE_TEAM_ID                   | The ten-character team identifier                           |
# | PARLOUR_BUILD_NUMBER            | CFBundleVersion; every upload of a version needs a new one  |
#
# and for --upload, an App Store Connect API key with the App Manager role:
# APPLE_API_KEY (its id), APPLE_API_ISSUER and APPLE_API_KEY_PATH (the .p8).

set -euo pipefail

upload=false
for arg in "$@"; do
  case "$arg" in
    --upload) upload=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$root"
desktop="apps/desktop"
tauri="$desktop/src-tauri"
out="$desktop/appstore/out"

identity="${APPSTORE_SIGNING_IDENTITY:--}"
if [ "$identity" != "-" ]; then
  missing=""
  for name in APPLE_TEAM_ID APPSTORE_PROVISIONING_PROFILE; do
    if [ -z "${!name:-}" ]; then missing="$missing $name"; fi
  done
  if [ -n "$missing" ]; then
    echo "Signing as $identity needs:$missing" >&2
    exit 1
  fi
  [ -f "$APPSTORE_PROVISIONING_PROFILE" ] || { echo "No profile at $APPSTORE_PROVISIONING_PROFILE." >&2; exit 1; }
fi
if $upload; then
  for name in APPSTORE_INSTALLER_IDENTITY APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH; do
    [ -n "${!name:-}" ] || { echo "--upload needs $name." >&2; exit 1; }
  done
  [ "$identity" != "-" ] || { echo "--upload needs APPSTORE_SIGNING_IDENTITY: Apple takes nothing signed ad hoc." >&2; exit 1; }
fi

echo "== Staging node, ffmpeg, whisper, llama.cpp and parlour"
node --experimental-strip-types "$desktop/appstore/stage.ts"

echo "== Building the app"
# The Apple variables are cleared for this step alone: given them, Tauri signs
# and notarises with the Developer ID setup the dmg uses, and notarising is
# not what an App Store build wants. The signing happens below instead.
(
  cd "$desktop"
  pnpm icons
  env -u APPLE_CERTIFICATE -u APPLE_CERTIFICATE_PASSWORD -u APPLE_SIGNING_IDENTITY \
    -u APPLE_ID -u APPLE_PASSWORD -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH \
    pnpm exec tauri build --bundles app --features appstore \
    --config src-tauri/tauri.appstore.conf.json -- --locked
)

rm -rf "$out"
mkdir -p "$out"
built="$(find "$tauri/target/release/bundle/macos" -maxdepth 1 -name "*.app" | head -1)"
[ -n "$built" ] || { echo "Tauri built no .app." >&2; exit 1; }
app="$out/$(basename "$built")"
# ditto rather than cp: it keeps what codesign cares about, and nothing else.
ditto "$built" "$app"
plist="$app/Contents/Info.plist"

if [ -n "${PARLOUR_BUILD_NUMBER:-}" ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $PARLOUR_BUILD_NUMBER" "$plist"
fi

entitlements="$out/app.entitlements"
if [ "$identity" = "-" ]; then
  # An ad hoc signature has no team, and an app that claims one without a
  # profile to back it up is killed at launch. The sandbox itself still works.
  cp "$tauri/AppStore.entitlements" "$entitlements"
  /usr/libexec/PlistBuddy -c "Delete :com.apple.application-identifier" "$entitlements"
  /usr/libexec/PlistBuddy -c "Delete :com.apple.developer.team-identifier" "$entitlements"
else
  sed "s/TEAM_ID/$APPLE_TEAM_ID/g" "$tauri/AppStore.entitlements" > "$entitlements"
  cp "$APPSTORE_PROVISIONING_PROFILE" "$app/Contents/embedded.provisionprofile"
fi

echo "== Signing as $identity"
main="$app/Contents/MacOS/$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$plist")"
# Every Mach-O inside the app other than the app's own executable, before the
# app is signed around them, because signing the app seals what is inside it.
# The four executables get the child entitlements and nothing else. Native
# modules and libraries under parlour's node_modules are signed without any:
# they run in node's process, under node's entitlements.
count=0
while IFS= read -r -d '' file; do
  [ "$file" = "$main" ] && continue
  case "$(file -b "$file")" in
    *Mach-O*executable*)
      codesign --force --sign "$identity" --entitlements "$tauri/AppStoreChild.entitlements" "$file"
      ;;
    *Mach-O*)
      codesign --force --sign "$identity" "$file"
      ;;
    *) continue ;;
  esac
  count=$((count + 1))
done < <(find "$app/Contents" -type f -print0)
echo "signed $count executables and libraries inside the app"
codesign --force --sign "$identity" --entitlements "$entitlements" "$app"

echo "== Checking the signature"
codesign --verify --deep --strict --verbose=2 "$app"
# Read back from the signature, since that is where they either are or are not.
signed="$(codesign --display --entitlements - --xml "$app" 2>/dev/null || true)"
for key in com.apple.security.app-sandbox com.apple.security.device.audio-input \
           com.apple.security.network.client com.apple.security.network.server; do
  case "$signed" in
    *"$key"*) ;;
    *) echo "$app is signed without $key." >&2; exit 1 ;;
  esac
done
node_ents="$(codesign --display --entitlements - --xml "$app/Contents/MacOS/node" 2>/dev/null || true)"
case "$node_ents" in
  *com.apple.security.inherit*) ;;
  *) echo "node is signed without com.apple.security.inherit; it would not start inside the sandbox." >&2; exit 1 ;;
esac

if [ -z "${APPSTORE_INSTALLER_IDENTITY:-}" ]; then
  echo "$app is signed, and sandboxed. No APPSTORE_INSTALLER_IDENTITY, so no package."
  echo "Open it from there to try it the way the store's copy will run."
  exit 0
fi

echo "== Packaging"
pkg="$out/Parlour.pkg"
xcrun productbuild --sign "$APPSTORE_INSTALLER_IDENTITY" --component "$app" /Applications "$pkg"
pkgutil --check-signature "$pkg"

if ! $upload; then
  echo "$pkg is ready. Run again with --upload, or hand it to Transporter."
  exit 0
fi

echo "== Validating and uploading"
# altool looks for the key as private_keys/AuthKey_<id>.p8 under the directory
# it runs in, so it gets a directory of its own holding only that.
keys="$out/private_keys"
mkdir -p "$keys"
cp "$APPLE_API_KEY_PATH" "$keys/AuthKey_$APPLE_API_KEY.p8"
trap 'rm -rf "$keys"' EXIT
pkg_abs="$(cd "$(dirname "$pkg")" && pwd)/$(basename "$pkg")"
(
  cd "$out"
  xcrun altool --validate-app --type macos --file "$pkg_abs" --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER"
  xcrun altool --upload-app --type macos --file "$pkg_abs" --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER"
)
echo "Uploaded. It shows in App Store Connect under TestFlight once Apple has processed it."
