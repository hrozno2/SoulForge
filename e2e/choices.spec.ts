import { expect, test } from "@playwright/test";
import { addTestContent, randomCharacter, tab } from "./helpers";

// Choices in the Build tab's list layout (the board's card backs use the same component, src/ui/Slots.tsx).
test.use({ viewport: { width: 1600, height: 900 }, storageState: { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "charforge.tutorial", value: "never" }, { name: "charforge.settings", value: JSON.stringify({ buildLayout: "tabs" }) }] }] } });

test("deselecting never folds a choice; picking folds it (C1.2)", async ({ page }) => {
  await addTestContent(page);
  await randomCharacter(page, 3);
  // An Emberkin: its "Ember gift" is a one-pick choice shown as a list (the random species varies).
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("charforge.current.v2")!);
    p.ch.race = "ID_SF_RACE_EMBERKIN";
    localStorage.setItem("charforge.current.v2", JSON.stringify(p));
  });
  await page.reload();
  await tab(page, "Build");
  await page.locator("nav.subtabs button", { hasText: "Species" }).click();
  const head = page.locator(".slot-head", { hasText: "Ember gift" });
  const key = await head.locator("xpath=../..").getAttribute("data-slot");
  expect(key, "Ember gift").not.toBeNull();
  const slot = page.locator(`[data-slot="${key}"] > .slot`);
  const body = slot.locator(".slot-body");
  // Open it (an unfilled choice starts open), then pick another option (a default one too becomes a real pick): it folds.
  if (!(await body.count())) await slot.locator(".slot-head").click();
  await expect(body).toBeVisible();
  await body.locator(".opt-row:not(.picked):not(.dim) .opt-main").first().click();
  await expect(body).toHaveCount(0);
  // Deselect it: the choice stays open (back to its default, if it has one).
  await slot.locator(".slot-head").click();
  await body.locator(".opt-row.picked .opt-main").first().click();
  await expect(body).toBeVisible();
});
