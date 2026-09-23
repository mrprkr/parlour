#!/usr/bin/env bash
#
# Stages what the App Store build carries and has Tauri build the app around
# it, unsigned. Shared by package.sh, for a build on this Mac, and by the Xcode
# project in ../xcode, which is how Xcode Cloud builds it. Prints the path to
# the built .app as its last line.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$root"
desktop="apps/desktop"

echo "== Staging node, ffmpeg, whisper, llama.cpp and parlour" >&2
node --experimental-strip-types "$desktop/appstore/stage.ts" >&2

echo "== Building the app" >&2
# The Apple variables are cleared for this step: given them, Tauri signs and
# notarises with the Developer ID setup the dmg uses, which is not what an App
# Store build wants. The signing happens afterwards, by whoever called this.
(
  cd "$desktop"
  pnpm icons >&2
  env -u APPLE_CERTIFICATE -u APPLE_CERTIFICATE_PASSWORD -u APPLE_SIGNING_IDENTITY \
    -u APPLE_ID -u APPLE_PASSWORD -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH \
    pnpm exec tauri build --bundles app --features appstore \
    --config src-tauri/tauri.appstore.conf.json -- --locked >&2
)

built="$(find "$root/$desktop/src-tauri/target/release/bundle/macos" -maxdepth 1 -name "*.app" | head -1)"
[ -n "$built" ] || { echo "Tauri built no .app." >&2; exit 1; }
echo "$built"
