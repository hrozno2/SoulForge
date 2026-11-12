import { expect, test } from "@playwright/test";
import { randomCharacter, tab } from "./helpers";

// docs/AUDIT-2026-11-10.md, S1 and S2: a save that fails is shown and tried again, never swallowed under "Saved".
test.use({ storageState: { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "charforge.tutorial", value: "never" }, { name: "charforge.settings", value: JSON.stringify({ buildLayout: "board", reduceMotion: true }) }] }] } });

test("a failed save says so, and Try again saves it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await randomCharacter(page, 3);
  await tab(page, "Build");
  const mark = page.locator(".actionbar .saved");
  await expect(mark).toHaveText("✓ Saved");

  // The library stops taking writes (a full disk, a broken store).
  await page.evaluate(() => {
    const w = window as unknown as { __put?: IDBObjectStore["put"] };
    w.__put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "characters") throw new DOMException("The disk is full", "QuotaExceededError");
      return w.__put!.apply(this, args);
    };
  });
  await page.getByLabel("Character name").fill("Kept Through Trouble");
  await page.getByLabel("Character name").blur();
  await expect(mark).toContainText("Not saved", { timeout: 5000 });
  await expect(mark).toHaveAttribute("role", "alert");

  // The store works again: Try again writes the edit that was waiting.
  await page.evaluate(() => { const w = window as unknown as { __put: IDBObjectStore["put"] }; IDBObjectStore.prototype.put = w.__put; });
  await mark.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".actionbar .saved")).toHaveText("✓ Saved");
  await tab(page, "Home");
  await expect(page.locator(".char-card", { hasText: "Kept Through Trouble" })).toHaveCount(1);
});

test("an edit made just before opening another character is kept", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await randomCharacter(page, 2);
  await tab(page, "Build");
  await page.getByLabel("Character name").fill("First One");
  await page.getByLabel("Character name").blur();
  await expect(page.locator(".actionbar .saved")).toHaveText("✓ Saved");
  await tab(page, "Home");
  await randomCharacter(page, 2);
  await tab(page, "Build");
  // Rename the second and go straight back to the first: the rename must not be lost with the switch.
  await page.getByLabel("Character name").fill("Second One");
  await page.getByLabel("Character name").blur();
  await tab(page, "Home");
  await page.locator(".char-card", { hasText: "First One" }).locator("button.char-card-body").click();
  await tab(page, "Home");
  await expect(page.locator(".char-card", { hasText: "Second One" })).toHaveCount(1);
  await expect(page.locator(".char-card", { hasText: "First One" })).toHaveCount(1);
});

// A damaged file opens with a report of what was damaged, and Build shows that report again (Chris, 2026-11-12).
test("a damaged character file opens with a repair report that Build can show again", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  const file = { version: 2, name: "Dented", classes: [{ classId: "NOT_A_CLASS", level: 99 }], selections: { "NOT_A_CLASS|0": "one" }, abilityBase: { strength: "strong" }, coins: { gp: "many" } };
  await page.locator('input[type=file][accept=".json"]').first().setInputFiles({ name: "dented.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  const report = page.getByRole("dialog", { name: "Repair report" });
  await expect(report).toBeVisible();
  await expect(report).toContainText("dented.json");
  await expect(report).toContainText("level was 99; set to 20");
  await expect(report).toContainText('Strength was "strong"');
  await expect(report).toContainText("Make them again there");
  await report.getByRole("button", { name: "Close" }).first().click();
  await expect(report).toHaveCount(0);

  // It stays on the character: Build opens it again, also after a reload.
  await page.getByRole("button", { name: "Repair report" }).click();
  await expect(report).toBeVisible();
  await report.getByRole("button", { name: "Close" }).first().click();
  await expect(page.locator(".actionbar .saved")).toHaveText("✓ Saved");
  await page.reload();
  await tab(page, "Build");
  await page.getByRole("button", { name: "Repair report" }).click();
  await expect(report).toContainText("dented.json");

  // Put right: the report is removed and the button goes.
  await report.getByRole("button", { name: /all put right/i }).click();
  await expect(page.getByRole("button", { name: "Repair report" })).toHaveCount(0);
});
