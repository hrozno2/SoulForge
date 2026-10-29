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
  // The new pick's choices open a moment after the pick lands: wait for them, then put them away.
  if (await back.waitFor({ timeout: 2000 }).then(() => true, () => false)) await back.locator(".card-back-ctl").getByRole("button", { name: "Done" }).click();
  await page.locator("[data-tile=magic]").click();
  const book = page.getByRole("button", { name: /Prepare spells/ });
  await book.click();
  const count = page.locator(".card-window h3", { hasText: "Prepared spells" });
  await expect(count).toContainText(/^Prepared spells 0 \//);
  const scroll = page.locator(".card-window .scroll-card:not(.dim)").first();
  await scroll.locator(".scroll-main").click();
  // The page flies into the book (C6.6), a grey outline is left; clicking the outline takes it back out.
  await page.waitForSelector(".flight-spellbook", { state: "attached", timeout: 2000 });
  await expect(count).toContainText(/^Prepared spells 1 \//);
  await expect(scroll).toHaveClass(/picked/);
  await scroll.locator(".scroll-main").click();
  await expect(count).toContainText(/^Prepared spells 0 \//);
  await scroll.locator(".scroll-main").click();
  await expect(count).toContainText(/^Prepared spells 1 \//);
  // The spellbook's printing is an export setting (C7.9), not a switch on the spellbook.
  await expect(page.locator(".card-window .spell-scope")).toHaveCount(0);
  await page.locator(".card-window").getByRole("button", { name: /^Done with / }).first().click();
  await tab(page, "Export");
  await page.getByRole("button", { name: "Export PDF..." }).click();
  const whole = page.getByLabel("Print the entire spellbook");
  await expect(whole).not.toBeChecked();
  await whole.check();
  await expect(whole).toBeChecked();
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
  // The new pick's choices open a moment after the pick lands: wait for them, then put them away.
  if (await back.waitFor({ timeout: 2000 }).then(() => true, () => false)) await back.locator(".card-back-ctl").getByRole("button", { name: "Done" }).click();
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

test("the spellbook stays in view while the spells scroll (C6.6)", async ({ page }) => {
  await addTestContent(page);
  await page.getByRole("button", { name: /new character/i }).click();
  await tab(page, "Build");
  await page.locator(".board-acc-head", { hasText: "Class" }).click();
  await page.locator(".board-acc.open .mini-card", { hasText: "Spellsinger" }).locator(".mini-main").click();
  const back = page.getByRole("dialog", { name: /choices/ });
  // The new pick's choices open a moment after the pick lands: wait for them, then put them away.
  if (await back.waitFor({ timeout: 2000 }).then(() => true, () => false)) await back.locator(".card-back-ctl").getByRole("button", { name: "Done" }).click();
  await page.locator("[data-tile=magic]").click();
  const win = page.locator(".float-window.card-window-magic");
  const art = win.locator(".card-back-art");
  // The window flies out of its slot first (C6.4): measure once it has landed.
  await win.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const top0 = (await art.boundingBox())!.y;
  await win.locator(".float-body").evaluate((b) => { b.scrollTop = 400; });
  await page.waitForTimeout(100);
  const scrolled = await win.locator(".float-body").evaluate((b) => b.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
  expect(Math.abs((await art.boundingBox())!.y - top0)).toBeLessThan(20);
  // The whole class: nothing sticky in any window sits inside a second scroll box (it would stick to that instead).
  await page.locator("[data-tile=equipment]").click();
  const caught = await page.evaluate(() => [...document.querySelectorAll(".float-body *")].filter((el) => getComputedStyle(el).position === "sticky").flatMap((el) => {
    const out: string[] = [];
    for (let e = el.parentElement; e && !e.classList.contains("float-body"); e = e.parentElement) if (getComputedStyle(e).overflowY !== "visible") out.push(`${el.className} inside ${e.className}`);
    return out;
  }));
  expect(caught).toEqual([]);
});

test("a card flies out of its slot, the slot stands empty, and Done flies it back (C6.4)", async ({ page }) => {
  await addTestContent(page);
  await page.getByRole("button", { name: /new character/i }).click();
  await tab(page, "Build");
  const tile = page.locator("[data-tile=equipment]");
  await tile.click();
  const win = page.locator(".float-window.card-window-equipment");
  await expect(win).toBeVisible();
  expect(await win.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
  await expect(tile).toHaveClass(/card-out/);
  await win.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await win.getByRole("button", { name: /^Done with / }).click();
  await expect(win).toHaveCount(0);
  await expect(tile).not.toHaveClass(/card-out/);
});

test("Manage's options keep their \"i\" in the option's line (C7.6)", async ({ page }) => {
  await addTestContent(page);
  await page.getByRole("button", { name: /new character/i }).click();
  await tab(page, "Manage");
  const row = page.locator("ul.options li").filter({ has: page.locator("button.learn") }).first();
  await expect(row).toHaveCount(1);
  const main = (await row.locator("button:not(.learn)").boundingBox())!;
  const info = (await row.locator("button.learn").boundingBox())!;
  expect(Math.abs(info.y - main.y)).toBeLessThan(6);
  expect(info.x).toBeGreaterThan(main.x + main.width - 4);
});

test("a card window keeps the source picker for a card in more than one book (C7.16)", async ({ page }) => {
  await addTestContent(page);
  await page.getByRole("button", { name: /new character/i }).click();
  await tab(page, "Build");
  await page.locator(".board-acc-head", { hasText: "Background" }).click();
  await page.locator(".board-acc.open .mini-card", { hasText: "Wayfarer" }).first().locator(".mini-main").click();
  const back = page.getByRole("dialog", { name: /choices/ });
  if (await back.waitFor({ timeout: 2000 }).then(() => true, () => false)) {
    await expect(back.locator(".card-back-source")).toBeVisible();
    await back.locator(".card-back-ctl").getByRole("button", { name: "Done" }).click();
  }
  await page.locator("[data-tile=background]").click();
  await expect(page.locator(".float-window.card-window-background .card-back-source")).toBeVisible();
});

test("hit points ask to be configured until fixed or rolled is chosen (C7.10)", async ({ page }) => {
  await addTestContent(page);
  await page.getByRole("button", { name: /new character/i }).click();
  await tab(page, "Build");
  await page.locator(".board-acc-head", { hasText: "Class" }).click();
  await page.locator(".board-acc.open .mini-card", { hasText: "Warden" }).locator(".mini-main").click();
  const back = page.getByRole("dialog", { name: /choices/ });
  if (await back.waitFor({ timeout: 2000 }).then(() => true, () => false)) await back.locator(".card-back-ctl").getByRole("button", { name: "Done" }).click();
  const bar = page.locator(".board-bar.hp");
  await expect(bar).toHaveClass(/configure/);
  await expect(bar).toContainText("Configure");
  // The choice checker lists it, and its line opens the dialog.
  await page.locator(".board-left-btn button").first().hover();
  await page.locator(".board-left-pop button", { hasText: "Hit points" }).click();
  const dialog = page.getByRole("dialog", { name: "Hit points" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Fixed (average)" }).click();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(bar).not.toHaveClass(/configure/);
  await expect(page.locator(".board-left-pop button", { hasText: "Hit points" })).toHaveCount(0);
});
