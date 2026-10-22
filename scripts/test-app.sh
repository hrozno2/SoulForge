#!/usr/bin/env bash
# Builds the app from the current source and installs it as "Soul Forge Test" in ~/Applications, next to the released one.
# It uses the same data as the released app, so do not run both at once. Usage: scripts/test-app.sh [--open]
set -euo pipefail
cd "$(dirname "$0")/.."
. "$HOME/.cargo/env"
# The window says TESTING, so the test build is never mistaken for the released app. The override replaces the whole
# window list, so it is the app's own window settings with only the title changed.
CONFIG=$(python3 -I -c 'import json,sys; c=json.load(open("src-tauri/tauri.conf.json")); w=c["app"]["windows"]; [x.update(title=x.get("title","Soul Forge")+" — TESTING") for x in w]; print(json.dumps({"bundle":{"createUpdaterArtifacts":False},"app":{"windows":w}}))')
VITE_TEST_BUILD="$(git rev-parse --short HEAD), built $(date +%H:%M)" VITE_TEST_TOOLS=1 npx tauri build --debug --bundles app --config "$CONFIG"
SRC="src-tauri/target/debug/bundle/macos/SoulForge.app"
DEST="$HOME/Applications/Soul Forge Test.app"
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "Installed: $DEST ($(git rev-parse --short HEAD), $(git log -1 --format=%s))"
if [ "${1:-}" = "--open" ]; then open "$DEST"; fi
