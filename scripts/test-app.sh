#!/usr/bin/env bash
# Builds the app from the current source and installs it as "Soul Forge Test" in ~/Applications, next to the released one.
# It uses the same data as the released app, so do not run both at once. Usage: scripts/test-app.sh [--open]
set -euo pipefail
cd "$(dirname "$0")/.."
. "$HOME/.cargo/env"
# The window says TESTING, so the test build is never mistaken for the released app. The override replaces the whole
# window list, so it is the app's own window settings with only the title changed.
CONFIG=$(python3 -I -c 'import json,sys; c=json.load(open("src-tauri/tauri.conf.json")); w=c["app"]["windows"]; [x.update(title=x.get("title","Soul Forge")+" — TESTING") for x in w]; print(json.dumps({"identifier":"app.charforge.test","bundle":{"createUpdaterArtifacts":False},"app":{"windows":w}}))')
# The test app has its own identity, so its own storage (Stage D1). The first time, it starts from a copy of what the
# two apps used to share; the released app keeps its own data untouched, and later rebuilds never copy again.
OLD="$HOME/Library/WebKit/app.charforge.desktop"
NEW="$HOME/Library/WebKit/app.charforge.test"
if [ -d "$OLD" ] && [ ! -d "$NEW" ]; then
  if pgrep -qx charforge; then echo "Quit Soul Forge first: the test app's first build copies its data." >&2; exit 1; fi
  ditto "$OLD" "$NEW"
  echo "Copied the library and content to the test app's own storage: $NEW"
fi
VITE_TEST_BUILD="$(git rev-parse --short HEAD), built $(date +%H:%M)" VITE_FLAVOR=test npx tauri build --debug --bundles app --config "$CONFIG"
SRC="src-tauri/target/debug/bundle/macos/SoulForge.app"
DEST="$HOME/Applications/Soul Forge Test.app"
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "Installed: $DEST ($(git rev-parse --short HEAD), $(git log -1 --format=%s))"
if [ "${1:-}" = "--open" ]; then open "$DEST"; fi
