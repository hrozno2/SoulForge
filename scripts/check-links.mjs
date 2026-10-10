// Checks that the sheet links Soul Forge points to still answer. Run weekly by .github/workflows/link-check.yml.
// Usage: node scripts/check-links.mjs
import { readFileSync } from "node:fs";

const urls = [...readFileSync("src/sheets/links.ts", "utf8").matchAll(/url:\s*"(https:\/\/[^"]+)"/g)].map((m) => m[1]);
if (!urls.length) {
  console.error("No links found in src/sheets/links.ts");
  process.exit(1);
}
let bad = 0;
for (const url of urls) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (SoulForge link check)" } });
    const body = res.headers.get("content-type")?.includes("html") ? await res.text() : "";
    // Drive answers 200 for a folder that was deleted; its page says so.
    const gone = /couldn't be found|can't be found|does not exist|no longer available|Page not found/i.test(body) && /drive\.google\.com/.test(url);
    if (!res.ok || gone) {
      console.error(`DOWN  ${res.status}${gone ? " (page says it is gone)" : ""}  ${url}`);
      bad++;
    } else console.log(`ok    ${res.status}  ${url}`);
  } catch (e) {
    console.error(`DOWN  ${e.message}  ${url}`);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
