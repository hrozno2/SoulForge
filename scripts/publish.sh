#!/usr/bin/env bash
# One-time setup: creates the GitHub repository and the Homebrew tap, generates the update
# signing key, stores the secrets, and pushes the code. Run it on your own machine.
#
# Usage: scripts/publish.sh [repo-name] [public|private]
# Needs: git, node, npm, and the GitHub CLI (gh) logged in with `gh auth login`.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="${1:-charforge}"
VISIBILITY="${2:-public}"

for tool in git node npm gh; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first." >&2; exit 1; }

OWNER="$(gh api user --jq .login)"
REPO="$OWNER/$NAME"
TAP="$OWNER/homebrew-$NAME"
echo "Creating $VISIBILITY repository $REPO and tap $TAP"
read -r -p "Continue? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || exit 1

if [[ ! -d node_modules ]]; then npm ci; fi

# Update signing key. Losing it means existing installs can never update again, so keep a backup.
KEY_DIR="$HOME/.charforge-signing"
KEY="$KEY_DIR/charforge.key"
if [[ ! -f "$KEY" ]]; then
  mkdir -p "$KEY_DIR"
  chmod 700 "$KEY_DIR"
  PASS="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("base64url"))')"
  printf '%s' "$PASS" > "$KEY_DIR/password.txt"
  chmod 600 "$KEY_DIR/password.txt"
  npx tauri signer generate -w "$KEY" --ci -p "$PASS" >/dev/null
  chmod 600 "$KEY"
  echo "Generated update signing key in $KEY_DIR. Back this folder up somewhere safe."
fi
PASS="$(cat "$KEY_DIR/password.txt")"

node scripts/configure.mjs "$REPO" "$(cat "$KEY.pub")"

[[ -d .git ]] || git init -q -b main
git add -A
git commit -q -m "Initial commit" || true

gh repo create "$REPO" "--$VISIBILITY" --source . --remote origin --push \
  --description "D&D 5e (2024) character builder with custom modifiers, content import and PDF export"

gh secret set TAURI_SIGNING_PRIVATE_KEY --repo "$REPO" < "$KEY"
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo "$REPO" --body "$PASS"

# Homebrew tap: a repository named homebrew-<name> that the release workflow keeps up to date.
if ! gh repo view "$TAP" >/dev/null 2>&1; then
  gh repo create "$TAP" --public --add-readme \
    --description "Homebrew tap for CharForge"
fi

cat <<MSG

Done. Repository: https://github.com/$REPO

Optional automation (the release still works without these, you just publish the package files yourself):

  1. Homebrew: create a fine-grained token with "Contents: read and write" on $TAP, then
       gh secret set HOMEBREW_TAP_TOKEN --repo $REPO
  2. Arch and CachyOS needs nothing from you: CI publishes a pacman repository as release assets.

Then ship the first version:
  scripts/release.sh 0.2.0
MSG
