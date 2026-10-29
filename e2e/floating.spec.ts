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

test("a window shrinks to its bar, focuses over a blur, goes partly out of sight with its bar kept, and drops into the bag (C6.3)", async ({ page }) => {
  await addTestContent(page);
  await page.getByRole("button", { name: "Search rules" }).click();
  await page.getByLabel("Compendium search").fill("ember");
  await page.locator(".csearch-float").first().click();
  const win = page.locator(".float-window").first();
  const bar = win.locator(".float-bar");
  // Double-click the bar: only the bar is left; again: open.
  await bar.dblclick({ position: { x: 40, y: 12 } });
  await expect(win.locator(".float-body")).toHaveCount(0);
  await bar.dblclick({ position: { x: 40, y: 12 } });
  await expect(win.locator(".float-body")).toHaveCount(1);
  // Focus: large, the page behind blurred; back again.
  await win.getByRole("button", { name: /^Focus on / }).click();
  await expect(page.locator(".float-backdrop")).toHaveCount(1);
  await expect(win).toHaveClass(/full/);
  await win.getByRole("button", { name: /^Back to its place/ }).click();
  await expect(page.locator(".float-backdrop")).toHaveCount(0);
  // Dragged far down and right: part of it leaves the window, the bar stays in reach.
  let box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(2000, 1200, { steps: 10 });
  await page.mouse.up();
  box = (await bar.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.x).toBeLessThanOrEqual(vp.width - 100);
  expect((await win.boundingBox())!.y + (await win.boundingBox())!.height).toBeGreaterThan(vp.height);
  // Dropped on the Bag of Holding: in the bag.
  const bag = (await page.locator(".bag-of-holding").boundingBox())!;
  box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(bag.x + bag.width / 2, bag.y + bag.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".float-window")).toHaveCount(0);
  await expect(page.locator(".bag-item")).toHaveCount(1);
  // Taken out again, it is wholly in sight though it went in half out of the window (C7.2).
  await page.locator(".bag-take").first().click();
  const back = (await page.locator(".float-window").first().boundingBox())!;
  expect(back.x).toBeGreaterThanOrEqual(0);
  expect(back.y + back.height).toBeLessThanOrEqual(vp.height);
  expect(back.x + back.width).toBeLessThanOrEqual(vp.width);
});
