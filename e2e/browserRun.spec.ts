import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { addTestContent, randomCharacter, tab, watchProblems } from "./helpers";

/**
 * The on-request browser run (C5.5; procedure in docs/BROWSER-RUN.md). BROWSER_RUN=<count> makes that many random
 * characters at random levels, opens every board space's card back, screenshots each into
 * test-results/browser-run/<n>-<space>.png, and checks each: no page error, no "?" or "undefined" where a name
 * belongs, and the rules check's verdict. Skipped in the normal test run.
 */
const N = Number(process.env.BROWSER_RUN) || 0;
test.use({ viewport: { width: 1600, height: 900 }, storageState: { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "charforge.tutorial", value: "never" }, { name: "charforge.settings", value: JSON.stringify({ buildLayout: "board", reduceMotion: true }) }] }] } });

test.skip(!N, "on request only: BROWSER_RUN=<count>");
test("browser run: random characters, every card checked", async ({ page }) => {
  test.setTimeout(120_000 + N * 30_000);
  const seen = watchProblems(page);
  const dir = "test-results/browser-run";
  mkdirSync(dir, { recursive: true });
  await addTestContent(page);
  const report: string[] = [];
  for (let i = 0; i < N; i++) {
    await tab(page, "Home");
    await randomCharacter(page, 1 + ((i * 7) % 20));
    await tab(page, "Build");
    const spaces = page.locator(".board-space:not(.disabled)");
    const kinds = await spaces.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tile ?? ""));
    for (const kind of kinds) {
      await page.locator(`[data-tile=${kind}]`).click();
      const back = page.locator(".card-window").first();
      if (!(await back.count())) continue;
      await page.screenshot({ path: `${dir}/${i}-${kind}.png` });
      const text = await back.innerText();
      if (/\bundefined\b|\bNaN\b|(^|\s)\?(\s|$)/.test(text)) report.push(`${i} ${kind}: odd text`);
      await back.getByRole("button", { name: /^Close / }).click();
    }
    const verdict = await page.locator(".rules-check-head").innerText().catch(() => "");
    report.push(`${i}: ${verdict.replace(/\s+/g, " ").trim()}`);
  }
  console.log(`BROWSERRUN\n${report.join("\n")}`);
  expect(seen.errors).toEqual([]);
  expect(report.filter((l) => /odd text/.test(l))).toEqual([]);
});
