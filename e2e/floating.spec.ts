import { expect, test } from "@playwright/test";
import { addTestContent } from "./helpers";

// Floating windows and the Bag of Holding (C4): compendium entries open as windows like 5e.tools; at most 10.
test.use({ viewport: { width: 1600, height: 900 }, storageState: { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "charforge.tutorial", value: "never" }, { name: "charforge.settings", value: JSON.stringify({ buildLayout: "board", reduceMotion: true }) }] }] } });

test("compendium entries float; ten at most; bag, take out, tidy, empty", async ({ page }) => {
  await addTestContent(page);
  const openEntry = async (q: string, nth = 0) => {
    await page.getByRole("button", { name: "Search rules" }).click();
    await page.getByLabel("Compendium search").fill(q);
    await page.locator(".csearch-float").nth(nth).click();
  };
  // Ten different entries: the spells of the test content and more.
  const names: string[] = [];
  for (const q of ["ember", "soft", "whisper", "healing", "thunder", "lullaby", "echo", "crescendo", "chime", "marching"]) {
    await openEntry(q);
    names.push(q);
  }
  await expect(page.locator(".float-window")).toHaveCount(10);
  // The eleventh: a message, nothing dropped.
  await openEntry("wistful");
  await expect(page.locator(".float-notice")).toContainText("10 windows are out");
  await expect(page.locator(".float-window")).toHaveCount(10);
  // Everything in the bag, one out again, tidy, then empty the bag.
  await page.getByRole("button", { name: "Put everything in the bag" }).click();
  await expect(page.locator(".float-window")).toHaveCount(0);
  await expect(page.locator(".bag-item")).toHaveCount(10);
  await page.locator(".bag-take").first().click();
  await expect(page.locator(".float-window")).toHaveCount(1);
  await page.getByRole("button", { name: "Empty the bag" }).click();
  await expect(page.locator(".bag-item")).toHaveCount(0);
  await expect(page.locator(".float-window")).toHaveCount(1);
  // A window drags by its title bar.
  const bar = page.locator(".float-bar").first();
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 110, { steps: 8 });
  await page.mouse.up();
  const after = (await bar.boundingBox())!;
  expect(Math.round(after.x - box.x)).toBeGreaterThan(150);
});
