// Sets the app version in every place that carries it.
// Usage: node scripts/bump-version.mjs 0.3.0
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: node scripts/bump-version.mjs <major.minor.patch>");
  process.exit(1);
}

function editJson(path, fn) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  fn(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

editJson("package.json", (d) => (d.version = version));
editJson("package-lock.json", (d) => {
  d.version = version;
  if (d.packages?.[""]) d.packages[""].version = version;
});
editJson("src-tauri/tauri.conf.json", (d) => (d.version = version));

const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
writeFileSync("src-tauri/Cargo.toml", cargo.replace(/^version = ".*"$/m, `version = "${version}"`));

// Keep Cargo.lock in step for the app's own entry.
try {
  const lock = readFileSync("src-tauri/Cargo.lock", "utf8");
  writeFileSync(
    "src-tauri/Cargo.lock",
    lock.replace(/(name = "charforge"\nversion = )"[^"]*"/, `$1"${version}"`),
  );
} catch {
  /* no lock file yet */
}
console.log(`version set to ${version}`);
