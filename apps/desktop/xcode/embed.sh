#!/usr/bin/env bash
#
# The Xcode build phase. Tauri builds the app, this copies it over the
# product Xcode is making and signs everything inside it, and Xcode signs the
# app around that as its last step, with the entitlements and profile it
# manages. Everything but the Xcode part is ../appstore, shared with
# package.sh.

set -euo pipefail

# A build phase gets Xcode's PATH, which has none of the tools; these are where
# ci_scripts/ci_post_clone.sh puts them in Xcode Cloud, and where Homebrew and
# rustup put them on a person's Mac.
tools="$HOME/.parlour-tools"
export PATH="$tools/node/bin:$tools/cmake/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
built="$("$here/../appstore/build.sh" | tail -1)"
dest="$TARGET_BUILD_DIR/$WRAPPER_NAME"

# Over the top of what Xcode made, keeping only the profile it embedded; its
# signature is about to be replaced anyway.
mkdir -p "$dest/Contents"
rsync -a --delete --exclude embedded.provisionprofile --exclude _CodeSignature \
  "$built/Contents/" "$dest/Contents/"

# Xcode Cloud numbers its builds, and App Store Connect wants each upload of a
# version to carry a new one.
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${CI_BUILD_NUMBER:-$CURRENT_PROJECT_VERSION}" \
  "$dest/Contents/Info.plist"

if [ "${CODE_SIGNING_ALLOWED:-YES}" = "NO" ]; then
  echo "Code signing is off for this build, so nothing inside is signed."
  exit 0
fi
"$here/../appstore/sign-nested.sh" "$dest" "${EXPANDED_CODE_SIGN_IDENTITY:--}"
