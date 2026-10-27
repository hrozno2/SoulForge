import { expect, test } from "@playwright/test";
import { addTestContent, randomCharacter, tab } from "./helpers";

// Choices in the Build tab's list layout (the board's card backs use the same component, src/ui/Slots.tsx).
test.use({ viewport: { width: 1600, height: 900 }, storageState: { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "charforge.tutorial", value: "never" }, { name: "charforge.settings", value: JSON.stringify({ buildLayout: "tabs" }) }] }] } });

test("deselecting never folds a choice; picking folds it (C1.2)", async ({ page }) => {
  await addTestContent(page);
  await randomCharacter(page, 3);
  await tab(page, "Build");
  const subs = page.locator("nav.subtabs button");
  let key: string | null = null;
  for (let t = 0; t < (await subs.count()) && !key; t++) {
    await subs.nth(t).click();
    for (const head of await page.locator(".slot.done .slot-head").all()) {
      const text = (await head.textContent()) ?? "";
      if (/1\/1/.test(text)) { key = await head.locator("xpath=../..").getAttribute("data-slot"); break; }
    }
  }
  expect(key, "a filled one-pick choice").not.toBeNull();
  const slot = page.locator(`[data-slot="${key}"] > .slot`);
  const body = slot.locator(".slot-body");
  // Pick another option (a default one too becomes a real pick): it folds.
  await slot.locator(".slot-head").click();
  await expect(body).toBeVisible();
  await body.locator(".opt-row:not(.picked):not(.dim) .opt-main").first().click();
  await expect(body).toHaveCount(0);
  // Deselect it: the choice stays open (back to its default, if it has one).
  await slot.locator(".slot-head").click();
  await body.locator(".opt-row.picked .opt-main").first().click();
  await expect(body).toBeVisible();
});
