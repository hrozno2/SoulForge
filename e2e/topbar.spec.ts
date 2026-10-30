import { test, expect } from "@playwright/test";
import { addTestContent, tab } from "./helpers";
test.use({ storageState: { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "charforge.tutorial", value: "never" }, { name: "charforge.settings", value: JSON.stringify({ buildLayout: "board", reduceMotion: true }) }] }] } });
for (const w of [1300, 1100, 980, 860, 760]) test(`the top bar fits a ${w}px window: no tab runs under the buttons (Chris 2026-10-30)`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: 700 });
  await addTestContent(page);
  await page.getByRole("button", { name: /new character/i }).click();
  await tab(page, "Build");
  await page.waitForTimeout(400);
  // No tab overlaps the buttons on the right.
  const nav = (await page.locator(".topbar .tabs-nav").boundingBox())!;
  const right = await page.locator(".topbar > :not(.tabs-nav):not(.brand)").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left).filter((x) => x > 0));
  expect(nav.x + nav.width).toBeLessThanOrEqual(Math.min(...right) + 1);
});
