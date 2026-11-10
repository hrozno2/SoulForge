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
// The tag must be new, and main must hold everything the remote has: a release cut behind it would fail at the push,
// after the version was already bumped and committed here.
if (sh(`git tag --list v${next}`)) throw new Error(`The tag v${next} exists already.`);
try {
  sh("git fetch --quiet origin main");
  if (Number(sh("git rev-list --count HEAD..origin/main")) > 0) throw new Error("origin/main has commits this checkout lacks. Pull first.");
} catch (e) {
  if (/origin\/main has commits/.test(String(e.message))) throw e;
  console.log("Could not reach the remote to compare with it; going on.");
}

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
// The interface, end to end on the built app under its security policy (docs/AUDIT-2026-11-10.md, H5).
console.log("Checking: the end-to-end tests...");
sh("npx playwright test", { show: true });
// The rules check: a fresh random batch, level 20 in every class, level-ups, multiclasses, companions, optional
// rules, community builds and full coverage of every subclass, species, background and feat, all checked against
// the rules and exported. A release is only cut when a fresh run (a new seed) has no findings at all.
// The full coverage run (an hour or more) only for releases cut Monday to Thursday in work hours (9 to 17); other
// times the standard check. RULES_TIER=full or RULES_TIER=standard decides it by hand.
const now = new Date();
const workHours = now.getDay() >= 1 && now.getDay() <= 4 && now.getHours() >= 9 && now.getHours() < 17;
const tier = process.env.RULES_TIER || (workHours ? "full" : "standard");
console.log(`Rules check (fresh seed, ${tier === "full" ? "full coverage" : "standard: full coverage runs Monday to Thursday, 9 to 17"})...`);
execSync("node scripts/rules-check.mjs", { stdio: "inherit", env: { ...process.env, RULES_TIER: tier } });

sh(`node scripts/bump-version.mjs ${next}`, { show: true });
const header = "# Changelog\n\nWhat changed in each release. Newest first.\n\n";
const old = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8").replace(header, "") : "";
writeFileSync("CHANGELOG.md", header + section + old);
sh("git add -A");
sh(`git commit -m "Release v${next}"`);
sh(`git tag v${next}`);
sh(`git push origin main v${next}`, { show: true });
console.log(`\nTagged v${next}. The release workflow builds and publishes it.`);
