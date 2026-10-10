#!/usr/bin/env bash
# Cuts a release: bumps the version, commits, tags and pushes. CI builds and publishes everything.
# Usage: scripts/release.sh 0.3.0
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: scripts/release.sh <major.minor.patch>" >&2
  exit 1
fi
if grep -q "__REPO__\|__UPDATER_PUBKEY__" src-tauri/tauri.conf.json src/config.ts; then
  echo "This copy is not configured yet. Run scripts/publish.sh first." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Commit or stash your changes first." >&2
  exit 1
fi
if git rev-parse "v$VERSION" >/dev/null 2>&1; then
  echo "Tag v$VERSION already exists." >&2
  exit 1
fi

node scripts/bump-version.mjs "$VERSION"
git add -A
git diff --cached --quiet || git commit -m "Release v$VERSION"
git tag "v$VERSION"
git push origin HEAD "v$VERSION"
echo "Pushed v$VERSION. Watch the build: gh run watch"
