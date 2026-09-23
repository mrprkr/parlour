#!/usr/bin/env bash
#
# Signs every Mach-O inside an App Store build of the app other than its own
# executable, which has to happen before the app is signed around them,
# because signing the app seals what is inside it. The four executables get
# the child entitlements (sandbox and inherit, nothing else, as Apple requires
# of helper tools). Native modules and libraries under parlour's node_modules
# are signed without any: they run in node's process, under node's.
#
# Usage: sign-nested.sh <path/to/App.app> <identity, or - for ad hoc>

set -euo pipefail

app="$1"
identity="$2"
child="$(cd "$(dirname "${BASH_SOURCE[0]}")/../src-tauri" && pwd)/AppStoreChild.entitlements"
main="$app/Contents/MacOS/$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$app/Contents/Info.plist")"

count=0
while IFS= read -r -d '' file; do
  [ "$file" = "$main" ] && continue
  case "$(file -b "$file")" in
    *Mach-O*executable*)
      codesign --force --sign "$identity" --entitlements "$child" "$file"
      ;;
    *Mach-O*)
      codesign --force --sign "$identity" "$file"
      ;;
    *) continue ;;
  esac
  count=$((count + 1))
done < <(find "$app/Contents" -type f -print0)
echo "signed $count executables and libraries inside $(basename "$app")"
