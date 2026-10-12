#!/usr/bin/env bash
# Builds the app from the current source and installs it as "Soul Forge Test" in ~/Applications, next to the released one.
# It uses the same data as the released app, so do not run both at once. Usage: scripts/test-app.sh [--open]
set -euo pipefail
cd "$(dirname "$0")/.."
. "$HOME/.cargo/env"
npx tauri build --debug --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
SRC="src-tauri/target/debug/bundle/macos/SoulForge.app"
DEST="$HOME/Applications/Soul Forge Test.app"
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "Installed: $DEST ($(git rev-parse --short HEAD), $(git log -1 --format=%s))"
if [ "${1:-}" = "--open" ]; then open "$DEST"; fi
