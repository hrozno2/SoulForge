// Fills in the repository name and updater public key everywhere they are needed.
// Usage: node scripts/configure.mjs <owner/name> <updater-public-key>
import { readFileSync, writeFileSync } from "node:fs";

const [repo, pubkey] = process.argv.slice(2);
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !pubkey) {
  console.error("Usage: node scripts/configure.mjs <owner/name> <updater-public-key>");
  process.exit(1);
}

const files = [
  "src-tauri/tauri.conf.json",
  "src/config.ts",
  "packaging/arch/PKGBUILD",
  "packaging/homebrew/soulforge.rb",
  "README.md",
];

for (const f of files) {
  const before = readFileSync(f, "utf8");
  const after = before.replaceAll("__REPO_OWNER__", repo.split("/")[0]).replaceAll("__REPO__", repo).replaceAll("__UPDATER_PUBKEY__", pubkey.trim());
  if (after !== before) {
    writeFileSync(f, after);
    console.log(`configured ${f}`);
  }
}
