import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { addTestContent, randomCharacter, tab } from "./helpers";

// Creation paths not covered elsewhere (C5.5): multiclass, preparing spells, the Foundry round trip, the settings.
test.use({ viewport: { width: 1600, height: 900 }, storageState: { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "charforge.tutorial", value: "never" }, { name: "charforge.settings", value: JSON.stringify({ buildLayout: "board" }) }] }] } });

const saved = (page: import("@playwright/test").Page) => page.evaluate(() => JSON.parse(localStorage.getItem("charforge.current.v2") ?? "{}").ch);

test("a level up can take a level in a new class (multiclass)", async ({ page }) => {
  await addTestContent(page);
  await randomCharacter(page, 3);
  // Scores that meet any class's multiclass requirement, so the other class can be taken.
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("charforge.current.v2")!);
    p.ch.abilityBase = { strength: 15, dexterity: 15, constitution: 15, intelligence: 15, wisdom: 15, charisma: 15 };
    localStorage.setItem("charforge.current.v2", JSON.stringify(p));
  });
  await page.reload();
  await tab(page, "Play");
  const before = (await saved(page)).classes as { classId: string }[];
  await page.locator(".hero-icons").getByRole("button", { name: "Level up" }).click();
  const dialog = page.getByRole("dialog", { name: "Level up" });
  await dialog.getByRole("button", { name: /new class \(multiclass\)/ }).click();
  const pick = dialog.locator(".levelup-multi .pick-card:not(.dim) button.pick-select").first();
  await pick.click();
  await dialog.locator("button.primary", { hasText: "Done" }).click();
  await expect.poll(async () => ((await saved(page)).classes as unknown[]).length).toBe(before.length + 1);
  // The class card holds a tab per class; the new one is a Multiclass tab with its own look (C4).
  await tab(page, "Build");
  await page.locator("[data-tile=class]").click();
  const win = page.locator(".float-window.card-window-class");
  await expect(win.locator(".class-tab")).toHaveCount(before.length + 1);
  await expect(win.locator(".class-tab.multiclass")).toHaveCount(before.length);
  await win.locator(".class-tab.multiclass").first().click();
  await expect(win.locator(".class-tab-body.multiclass")).toBeVisible();
});

test("a caster who prepares picks today's spells on the spellbook", async ({ page }) => {
  await addTestContent(page);
  await page.getByRole("button", { name: /new character/i }).click();
  await tab(page, "Build");
  await page.locator(".board-acc-head", { hasText: "Class" }).click();
  await page.locator(".board-acc.open .mini-card", { hasText: "Spellsinger" }).locator(".mini-main").click();
  const back = page.getByRole("dialog", { name: /choices/ });
  if (await back.count()) await back.locator(".card-back-ctl").getByRole("button", { name: "Done" }).click();
  await page.locator("[data-tile=magic]").click();
  const book = page.getByRole("button", { name: /Prepare spells/ });
  await book.click();
  const count = page.locator(".card-window h3", { hasText: "Prepared spells" });
  await expect(count).toContainText(/^Prepared spells 0 \//);
  await page.locator(".card-window .scroll-card:not(.dim) .scroll-main, .card-window .pick-card:not(.dim) button.pick-select").first().click();
  await expect(count).toContainText(/^Prepared spells 1 \//);
  // One print setting for sheets and cards, by the spellbook and in the export panel alike (C6.5).
  await page.locator(".card-window .spell-scope").getByRole("button", { name: "Prepared only" }).click();
  await page.locator(".card-window").getByRole("button", { name: /^Done with / }).first().click();
  await tab(page, "Export");
  await page.getByRole("button", { name: "Export PDF..." }).click();
  await expect(page.locator(".spell-scope").getByRole("button", { name: "Prepared only" })).toHaveAttribute("aria-pressed", "true");
});

test("a character exported for Foundry comes back through the importer", async ({ page }) => {
  await addTestContent(page);
  await randomCharacter(page, 4);
  const ch = await saved(page);
  await tab(page, "Export");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export for Foundry" }).click()]);
  const json = readFileSync((await download.path())!, "utf8");
  await tab(page, "Home");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import Foundry / Roll20 / Plutonium" }).click();
  await (await chooser).setFiles({ name: "round.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect(page.getByRole("dialog", { name: /import/i }).first()).toBeVisible();
  const back = await saved(page);
  expect(back.name).toBe(ch.name);
  expect(back.classes).toEqual(ch.classes);
  expect(back.race).toBe(ch.race);
});

test("settings: compact layout, reduce motion and the build layout take effect", async ({ page }) => {
  await page.goto("/");
  const open = async () => { await page.getByRole("button", { name: /^menu/i }).click(); await page.getByRole("button", { name: /^Settings/ }).click(); };
  await open();
  const row = (name: string) => page.locator(".set-row", { hasText: name }).locator("input[type=checkbox]");
  await row("Compact layout").check();
  await expect(page.locator("html")).toHaveClass(/\bcompact\b/);
  await row("Reduce motion").check();
  await expect(page.locator("html")).toHaveClass(/\breduce-motion\b/);
  await page.getByRole("button", { name: "Tabs", exact: true }).click();
  await page.keyboard.press("Escape");
  await tab(page, "Build");
  await expect(page.locator("nav.subtabs")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bcompact\b/);
});

test("an item of your choice in the starting gear is picked inside its box (C6)", async ({ page }) => {
  await addTestContent(page);
  await page.getByRole("button", { name: /new character/i }).click();
  await tab(page, "Build");
  await page.locator(".board-acc-head", { hasText: "Class" }).click();
  await page.locator(".board-acc.open .mini-card", { hasText: "Spellsinger" }).locator(".mini-main").click();
  const back = page.getByRole("dialog", { name: /choices/ });
  if (await back.count()) await back.locator(".card-back-ctl").getByRole("button", { name: "Done" }).click();
  await page.locator("[data-tile=equipment]").click();
  const box = page.locator(".card-window .equip-card", { hasText: "Musical Instrument" }).first();
  const pick = box.getByLabel(/^Choose the Musical Instrument/);
  await expect(pick).toBeVisible();
  await pick.selectOption({ label: "Lute" });
  await expect(box.locator("p.muted")).toContainText("Lute");
  await box.getByRole("button", { name: /^Add/ }).click();
  await page.getByRole("tab", { name: /Inventory/ }).click();
  await expect(page.locator(".card-window table.inv tr", { hasText: "Lute" })).toHaveCount(1);
  await expect(page.locator(".card-window .pending-pick")).toHaveCount(0);
});
