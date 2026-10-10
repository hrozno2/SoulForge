// One command to cut a release: checks, version bump, changelog, commit, tag, push.
// Usage: node scripts/release.mjs patch|minor|major|x.y.z [--dry]
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const arg = process.argv[2];
const dry = process.argv.includes("--dry");
if (!arg) {
  console.error("Usage: node scripts/release.mjs patch|minor|major|x.y.z [--dry]");
  process.exit(1);
}
const sh = (cmd, opts = {}) => execSync(cmd, { encoding: "utf8", stdio: opts.show ? "inherit" : ["ignore", "pipe", "pipe"] })?.toString().trim() ?? "";

const current = JSON.parse(readFileSync("package.json", "utf8")).version;
const [maj, min, pat] = current.split(".").map(Number);
const next = /^\d+\.\d+\.\d+$/.test(arg) ? arg : arg === "major" ? `${maj + 1}.0.0` : arg === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;

if (sh("git status --porcelain")) throw new Error("The working tree has uncommitted changes. Commit or stash them first.");
if (sh("git rev-parse --abbrev-ref HEAD") !== "main") throw new Error("Releases are cut from main.");

const lastTag = (() => {
  try {
    return sh("git describe --tags --abbrev=0");
  } catch {
    return "";
  }
})();
const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
const subjects = sh(`git log ${range} --pretty=%s`)
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s && !/^Release v/i.test(s) && !/^Merge /i.test(s));

const date = new Date().toISOString().slice(0, 10);
const section = `## v${next} (${date})\n\n${subjects.length ? subjects.map((s) => `- ${s}`).join("\n") : "- Maintenance."}\n\n`;
console.log(`Releasing ${current} -> ${next}\n\n${section}`);
if (dry) process.exit(0);

console.log("Checking: types, tests, build...");
sh("npx tsc --noEmit", { show: true });
sh("npm test", { show: true });
sh("npm run build", { show: true });

sh(`node scripts/bump-version.mjs ${next}`, { show: true });
const header = "# Changelog\n\nWhat changed in each release. Newest first.\n\n";
const old = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8").replace(header, "") : "";
writeFileSync("CHANGELOG.md", header + section + old);
sh("git add -A");
sh(`git commit -m "Release v${next}"`);
sh(`git tag v${next}`);
sh(`git push origin main v${next}`, { show: true });
console.log(`\nTagged v${next}. The release workflow builds and publishes it.`);
