import { expect, test } from "@playwright/test";
import { addTestContent, tab, watchProblems, randomCharacter } from "./helpers";

test.describe("Soul Forge smoke tests", () => {
  test("starts, switches tabs and themes without policy violations or errors", async ({ page }) => {
    const seen = watchProblems(page);
    await page.goto("/");
    await expect(page.locator("header")).toContainText("Soul Forge");
    for (const name of ["Build", "Magic", "Equipment", "Manage", "Play", "Sheet", "Content", "Home"]) {
      await tab(page, name);
      await expect(page.locator("main")).toBeVisible();
    }
    await page.getByRole("button", { name: /^menu/i }).click();
    await page.locator(".theme select").selectOption("daylight");
    await expect(page.locator("html")).toHaveAttribute("data-skin", "daylight");
    expect(seen.csp).toEqual([]);
    expect(seen.errors).toEqual([]);
  });

  test("adds content from a link, builds a random character and plays it", async ({ page }) => {
    const seen = watchProblems(page);
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Play");
    await expect(page.locator(".play-id h1")).toHaveText(/random adventurer/i);
    await expect(page.locator(".ab-box")).toHaveCount(6);
    await expect(page.locator(".hp-bar")).toBeVisible();
    // Roll an ability check: the dice panel opens with a result card.
    await page.locator(".ab-box").first().click();
    await expect(page.locator(".roll-card .roll-total")).toBeVisible();
    expect(seen.csp).toEqual([]);
    expect(seen.errors).toEqual([]);
  });

  test("the dice tray builds a roll from clicks", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^dice$/i }).click();
    const die = (n: number) => page.locator(".die-btn").nth(n);
    await die(1).click();
    await die(1).click();
    await die(2).click();
    await page.getByRole("button", { name: "+1", exact: true }).click();
    await expect(page.getByLabel("Dice to roll")).toHaveValue("2d6+1d8+1");
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    const total = Number(await page.locator(".roll-total").innerText());
    expect(total).toBeGreaterThanOrEqual(4);
    expect(total).toBeLessThanOrEqual(21);
    await page.getByRole("button", { name: /close dice/i }).click();
    await expect(page.locator(".dice-panel")).toHaveCount(0);
  });

  test("changes the interface size and remembers it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^menu/i }).click();
    await page.getByRole("button", { name: /settings/i }).click();
    await page.locator("input[type=range]").first().fill("120");
    expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe("1.2");
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe("1.2");
  });

  test("exports a PDF sheet that opens as a real PDF", async ({ page }) => {
    const seen = watchProblems(page);
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Sheet");
    await page.getByRole("button", { name: /export pdf/i }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /create pdf/i }).click();
    const file = await download;
    const path = await file.path();
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(path!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(20_000);
    expect(seen.csp).toEqual([]);
    expect(seen.errors).toEqual([]);
  });

  test("backs up and restores characters", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page);
    await page.waitForTimeout(1200); // the character is saved to the library shortly after it changes
    await page.getByRole("button", { name: /^menu/i }).click();
    await page.getByRole("button", { name: /settings/i }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /back up all characters/i }).click();
    const file = await download;
    const { readFileSync } = await import("node:fs");
    const backup = JSON.parse(readFileSync((await file.path())!, "utf8"));
    expect(backup.kind).toBe("backup");
    expect(backup.characters.length).toBeGreaterThanOrEqual(1);
    expect(backup.characters[0].data.version).toBe(2);
  });

  test("conditions change rolls and say why", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Play");
    await page.locator(".play-tabs").getByRole("button", { name: "Extras" }).click();
    await page.getByRole("button", { name: "Poisoned" }).click();
    await page.getByRole("button", { name: "Raise exhaustion" }).click();
    await page.locator(".ab-box").first().click();
    await expect(page.locator(".roll-note").filter({ hasText: "Poisoned: disadvantage" })).toBeVisible();
    await expect(page.locator(".roll-note").filter({ hasText: "Exhaustion 1: -2" })).toBeVisible();
    await expect(page.locator(".roll-card")).toContainText("(disadvantage)");
    // The sheet's Advantage switch cancels the condition's disadvantage.
    await page.getByRole("button", { name: "Advantage", exact: true }).click();
    await page.locator(".ab-box").first().click();
    await expect(page.locator(".roll-card")).not.toContainText("(disadvantage)");
    await expect(page.locator(".roll-card")).not.toContainText("(advantage)");
  });

  test("wild shape takes damage first, the journal keeps entries, the language switches", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Play");
    await page.locator(".play-tabs").getByRole("button", { name: "Extras" }).click();
    await page.getByPlaceholder("Form, for example Brown Bear").fill("Wolf");
    await page.getByLabel("Form hit points").fill("11");
    await page.getByRole("button", { name: "Assume form" }).click();
    await expect(page.locator(".hp-bar.wild")).toContainText("Wolf: 11 / 11");
    await page.locator(".hp-manage input").fill("4");
    await page.locator(".hp-manage").getByRole("button", { name: "Damage" }).click();
    await expect(page.locator(".hp-bar.wild")).toContainText("Wolf: 7 / 11");
    await page.locator(".play-tabs").getByRole("button", { name: "Notes" }).click();
    await page.getByRole("button", { name: "New entry" }).click();
    await page.getByLabel("Entry title").fill("Session one");
    await page.getByLabel("Entry text").fill("We met the innkeeper.");
    await page.reload();
    await tab(page, "Play");
    await page.locator(".play-tabs").getByRole("button", { name: "Notes" }).click();
    await expect(page.getByLabel("Entry title")).toHaveValue("Session one");
    await page.getByRole("button", { name: /^menu/i }).click();
    await page.getByRole("button", { name: /settings/i }).click();
    await page.getByLabel("Language", { exact: true }).selectOption("de");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.locator("header nav")).toContainText("Spielen");
  });

  test("the homebrew builder makes a spell that shows up in the content browser", async ({ page }) => {
    await addTestContent(page);
    await tab(page, "Content");
    await page.getByRole("button", { name: "New spell" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Test Flame");
    await page.getByLabel("On the spell lists of").fill("Spellsinger");
    await page.getByLabel("Description").fill("A small flame dances on your palm.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".homebrew .notice")).toContainText("Saved Test Flame");
    await page.getByPlaceholder("Search by name").last().fill("Test Flame");
    await expect(page.locator("ul.options.boxed").last()).toContainText("Test Flame");
  });

  test("a guided level up adds the level, shows what it brings, and can be undone", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Play");
    const level = async () => Number(await page.locator(".level-medal b").innerText());
    const start = await level();
    await page.locator(".play-buttons").getByRole("button", { name: "Level up" }).click();
    const dialog = page.getByRole("dialog", { name: "Level up" });
    await dialog.getByRole("button", { name: "Level up" }).first().click();
    await expect(dialog.getByText("Hit points", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Maximum hit points went up/)).toBeVisible();
    expect(await level()).toBe(start + 1);
    await dialog.getByRole("button", { name: /undo this level/i }).click();
    await expect(dialog).toHaveCount(0);
    expect(await level()).toBe(start);
    // Doing it again and finishing keeps the level.
    await page.locator(".play-buttons").getByRole("button", { name: "Level up" }).click();
    await dialog.getByRole("button", { name: "Level up" }).first().click();
    await dialog.getByRole("button", { name: "Done" }).click();
    expect(await level()).toBe(start + 1);
  });
});
