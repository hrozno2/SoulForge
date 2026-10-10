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
    // Rolling empties the tray: no dice counters left.
    await expect(page.getByLabel("Dice to roll")).toHaveValue("");
    await expect(page.locator(".die-count")).toHaveCount(0);
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
    // Entries are one compact line until opened.
    await expect(page.getByLabel("Entry title")).toHaveCount(0);
    await expect(page.locator(".journal-line")).toContainText("We met the innkeeper.");
    await page.locator(".journal-line").click();
    await expect(page.getByLabel("Entry title")).toHaveValue("Session one");
    await page.locator(".journal-line").click();
    await expect(page.getByLabel("Entry title")).toHaveCount(0);
    await page.getByRole("button", { name: /^menu/i }).click();
    await page.getByRole("button", { name: /settings/i }).click();
    await page.getByLabel("Language", { exact: true }).selectOption("de");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.locator("header nav")).toContainText("Spielen");
  });

  test("point buy follows the standard table and custom house rules", async ({ page }) => {
    await addTestContent(page);
    await tab(page, "Build");
    await page.getByRole("button", { name: /^Ability/ }).first().click();
    await page.getByRole("button", { name: "Point buy" }).click();
    await expect(page.getByText("0 / 27 points")).toBeVisible();
    // Three 15s are 27 points, so nothing else can go up.
    const plus = page.locator(".abilities .stepper button", { hasText: "+" });
    for (let i = 0; i < 7; i++) { await plus.nth(0).click(); await plus.nth(1).click(); await plus.nth(2).click(); }
    await expect(page.getByText("27 / 27 points")).toBeVisible();
    await expect(plus.nth(3)).toBeDisabled();
    await page.locator(".pb-rules summary").click();
    await page.getByLabel("Points to spend").fill("40");
    await page.getByLabel("Highest score").fill("17");
    await expect(plus.nth(3)).toBeEnabled();
    await expect(page.getByLabel("Cost of 17")).toBeVisible();
    await page.getByRole("button", { name: "Standard rules" }).click();
    await expect(page.getByText("/ 27 points")).toBeVisible();
  });

  test("global content filters hide books from lists and keep what is picked", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Build");
    await page.getByRole("button", { name: /^Species/ }).first().click();
    await page.getByRole("button", { name: "Change" }).click();
    await expect(page.getByText(/hidden by your content filters/)).toHaveCount(0);
    await page.getByRole("button", { name: /^menu/i }).click();
    await page.getByRole("button", { name: /settings/i }).click();
    await page.getByLabel(/Settings and other sources/).uncheck();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText(/hidden by your content filters/).first()).toBeVisible();
    await page.getByRole("button", { name: /^menu/i }).click();
    await page.getByRole("button", { name: /settings/i }).click();
    await page.getByLabel(/Settings and other sources/).check();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText(/hidden by your content filters/)).toHaveCount(0);
  });

  test("starting equipment folds class and background one at a time", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Equipment");
    const origins = page.locator(".equip-origin");
    await expect(origins).toHaveCount(2);
    await origins.first().getByRole("button", { name: "Add", exact: true }).first().click();
    // The class folds, the background is still open, and the panel is still there.
    await expect(page.locator(".equip-origin-done")).toHaveCount(1);
    await expect(page.locator(".equip-origin:not(.equip-origin-done)")).toHaveCount(1);
    await page.locator(".equip-origin:not(.equip-origin-done)").getByRole("button", { name: "Add", exact: true }).first().click();
    await expect(page.locator(".equip-done")).toBeVisible();
    // Change the class option: the earlier one is marked as added, and choosing the other replaces it.
    await page.getByRole("button", { name: "Add more..." }).click();
    await page.locator(".equip-origin-done").first().getByRole("button", { name: "Change" }).click();
    await expect(page.locator(".equip-card.chosen")).toHaveCount(1);
    await page.locator(".equip-card:not(.chosen)").first().getByRole("button", { name: /instead/ }).click();
    await expect(page.locator(".equip-done")).toBeVisible();
    // Gear you add is marked, counted, and the panel stays open.
    await page.getByRole("button", { name: "Add more..." }).click();
    const gear = page.locator(".equip-card ~ *, section.card").getByRole("button", { name: /^\+ / }).first();
    const gearName = ((await gear.innerText()).replace(/^\+ /, "")).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await gear.click();
    await page.getByRole("button", { name: new RegExp(`✓ ${gearName}`) }).click();
    await expect(page.getByRole("button", { name: new RegExp(`✓ ${gearName} ×2`) })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /^Added/ })).toBeVisible();
    // The same gear twice is one line with a bigger quantity.
    await tab(page, "Equipment");
    const names = await page.locator("table tbody tr td:first-child").allInnerTexts();
    expect(new Set(names.map((n) => n.trim())).size).toBe(names.length);
  });

  test("favorites row: resources stay, things can be starred or dragged in, and it hides only when asked", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Play");
    const bar = page.getByRole("region", { name: "Favorites" });
    await expect(bar).toBeVisible();
    // A resource shows in the row on every tab.
    await page.locator(".play-tabs").getByRole("button", { name: "Resources" }).click();
    await page.getByRole("button", { name: "Add resource" }).click();
    await page.getByLabel("Resource name").fill("Ki");
    await expect(bar.getByText("Ki")).toBeVisible();
    await page.locator(".play-tabs").getByRole("button", { name: "Notes" }).click();
    await expect(bar.getByText("Ki")).toBeVisible();
    // Star a feature, then drag another in.
    await page.locator(".play-tabs").getByRole("button", { name: /^Features/ }).click();
    const rows = page.locator(".play-body .feature-row");
    await rows.nth(0).getByRole("button", { name: "Add to favorites" }).click();
    await expect(bar.locator(".fav-tile.feature")).toHaveCount(1);
    if ((await rows.count()) > 1) {
      await rows.nth(1).dragTo(bar);
      await expect(bar.locator(".fav-tile.feature")).toHaveCount(2);
    }
    // Only the player hides it, and that sticks.
    await bar.getByRole("button", { name: "Hide" }).click();
    await expect(page.getByRole("button", { name: /Show favorites/ })).toBeVisible();
    await page.reload();
    await tab(page, "Play");
    await expect(page.getByRole("button", { name: /Show favorites/ })).toBeVisible();
  });

  test("a form can come from a creature, shows its stat block, and polymorph ties to concentration", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Play");
    await page.locator(".play-tabs").getByRole("button", { name: "Extras" }).click();
    await page.getByLabel("Kind of form").selectOption("polymorph");
    await page.getByLabel("Find a creature").fill("cave");
    await page.getByRole("button", { name: /Cave Hound/ }).click();
    await expect(page.getByLabel("Form hit points")).toHaveValue("13");
    await page.getByRole("button", { name: "Assume form" }).click();
    await expect(page.locator(".hp-bar.wild")).toContainText("Cave Hound: 13 / 13");
    await page.getByText("Stat block", { exact: true }).click();
    await expect(page.locator(".forms-panel .statblock")).toContainText("Bite");
    // Polymorph is a concentration spell.
    await expect(page.getByText(/Concentrating|concentrat/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Revert" }).click();
    await expect(page.locator(".hp-bar.wild")).toHaveCount(0);
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
    await dialog.locator("button.primary", { hasText: "Done" }).click();
    expect(await level()).toBe(start + 1);
  });
});
