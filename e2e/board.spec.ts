import { expect, test } from "@playwright/test";
import { addTestContent, tab, watchProblems, randomCharacter } from "./helpers";

// The build board, the default Build layout.
test.use({ viewport: { width: 1600, height: 900 }, storageState: { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "charforge.tutorial", value: "never" }, { name: "charforge.settings", value: JSON.stringify({ buildLayout: "board" }) }] }] } });

test.describe("Build board", () => {
  test("lays out lists, the board and the scores, and fills a space from a list", async ({ page }) => {
    const seen = watchProblems(page);
    await addTestContent(page);
    await randomCharacter(page, 3);
    await tab(page, "Build");
    const nav = page.locator("header nav");
    // Spells and equipment live on the board, so their top tabs go; Play and Export stand alone.
    await expect(nav.getByRole("button", { name: /^Magic/ })).toHaveCount(0);
    await expect(nav.getByRole("button", { name: /^Export/ })).toBeVisible();
    await expect(page.locator(".board-lib")).toBeVisible();
    await expect(page.locator(".board-stats")).toBeVisible();
    await expect(page.locator("[data-tile=race] h3")).not.toBeEmpty();

    // Open the species list and pick another one: its card takes the space.
    await page.locator(".board-acc-head", { hasText: "Species" }).click();
    const rows = page.locator(".board-acc.open .mini-card:not(.picked) .mini-name");
    const name = (await rows.first().textContent())!.trim();
    await rows.first().click();
    // The pick turns over to its back, with its choices; Done lands it in its space.
    const backside = page.getByRole("dialog", { name: "Species choices" });
    await expect(backside).toBeVisible();
    await backside.locator(".card-back-ctl").getByRole("button", { name: "Done" }).click();
    await expect(backside).toHaveCount(0);
    await expect(page.locator("[data-tile=race] h3")).toHaveText(name);
    // Clicking the card opens it in a floating window (C4) to edit its choices; Done (C6.3) puts it back.
    await page.locator("[data-tile=race] .chosen-banner").click();
    const win = page.locator(".float-window.card-window-race");
    await expect(win).toBeVisible();
    await win.getByRole("button", { name: /^Done with / }).click();
    await expect(win).toHaveCount(0);
    await expect(page.locator("[data-tile=race] h3")).toHaveText(name);

    // Scores: point buy shows the points left, and a plus raises a score.
    await page.locator(".board-method button", { hasText: "Point buy" }).click();
    await expect(page.locator(".board-method-note")).toContainText("points left");
    const str = page.locator(".board-score").first().locator(".board-num");
    const before = Number(await str.textContent());
    await page.getByRole("button", { name: "Raise Strength" }).click();
    await expect(str).toHaveText(String(before + 1));

    // The portrait and the name sit at the top of the scores.
    await expect(page.getByRole("button", { name: /portrait/i })).toBeVisible();
    await page.getByLabel("Character name").fill("Board Tester");
    await expect(page.getByLabel("Character name")).toHaveValue("Board Tester");
    expect(seen.csp).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
});

test("the backpack shows starting gear, inventory or shop, and always opens on the starting gear (C1.5, C6.1)", async ({ page }) => {
  await addTestContent(page);
  await randomCharacter(page, 3);
  await tab(page, "Build");
  await page.locator("[data-tile=equipment]").click();
  const gear = page.getByRole("tab", { name: /Starting gear/ });
  const inv = page.getByRole("tab", { name: /Inventory/ });
  await expect(gear).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".board-lib-sub", { hasText: "All items" })).toBeVisible();
  await inv.click();
  await expect(inv).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".board-lib-sub", { hasText: "All items" })).toHaveCount(0);
  // Closed on the inventory and opened again: back on the starting gear.
  await page.locator(".card-window-equipment").getByRole("button", { name: /^Close |^Done/ }).first().click();
  await page.locator("[data-tile=equipment]").click();
  await expect(page.getByRole("tab", { name: /Starting gear/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".board-lib-sub", { hasText: "All items" })).toBeVisible();
});

test("the shop on the backpack buys with the purse and the inventory sells back at the same price (C3)", async ({ page }) => {
  await addTestContent(page);
  await randomCharacter(page, 3);
  await tab(page, "Build");
  await page.locator("[data-tile=equipment]").click();
  await page.getByRole("tab", { name: /Inventory/ }).click();
  await page.locator(".coin", { hasText: "GP" }).locator("input").fill("100");
  await page.getByRole("tab", { name: /Shop/ }).click();
  const shop = page.locator(".card-window .shop");
  await expect(shop.locator(".summary")).toContainText("100 gp");
  const row = shop.locator(".opt-row:not(.dim)", { has: page.locator(".opt-label") }).first();
  const name = (await row.locator(".opt-name").textContent())!.trim();
  await row.locator(".opt-main").click();
  await expect(shop.locator(".summary")).toContainText(`Bought ${name}`);
  await page.getByRole("tab", { name: /Inventory/ }).click();
  const line = page.locator(".card-window table.inv tr", { hasText: name }).first();
  await line.getByRole("button", { name: /^Sell/ }).click();
  await expect(page.locator(".card-window table.inv tr", { hasText: name })).toHaveCount(0);
  // One to one: the purse is back where it started.
  await page.getByRole("tab", { name: /Shop/ }).click();
  await expect(shop.locator(".summary")).toContainText("100 gp");
});

test("blank details never count as a choice; the board's Details button opens them (C2)", async ({ page }) => {
  await addTestContent(page);
  await randomCharacter(page, 3);
  await tab(page, "Build");
  // A finished random character with no details: nothing is left to choose, and the board says the details are blank.
  await expect(page.locator(".details-default")).toContainText("details are at their defaults");
  await expect(page.locator(".board p.ok", { hasText: "Everything is chosen" })).toBeVisible();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Character details" });
  await dialog.getByLabel("Ideals").fill("Freedom");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".details-default")).toHaveCount(0);
});

test.describe("Build board on a narrow window", () => {
  test.use({ viewport: { width: 1100, height: 820 } });
  test("the lists open from the edge or a card, step aside while a pick lands, and close when the mouse leaves", async ({ page }) => {
    const seen = watchProblems(page);
    await addTestContent(page);
    await page.getByRole("button", { name: /new character/i }).click();
    await tab(page, "Build");
    const board = page.locator(".board");
    await expect(page.getByRole("button", { name: "Show the lists" })).toBeVisible();
    await expect(board).not.toHaveClass(/side-left/);
    // A card's See options brings the lists out.
    await page.locator("[data-tile=race]").getByRole("button", { name: /see options/i }).click();
    await expect(board).toHaveClass(/side-left/);
    // A pick: the panel steps aside while the card's back is open and while it lands, then comes back as it was.
    await page.locator(".board-acc.open .mini-card .mini-main").first().click();
    await expect(board).toHaveClass(/fly-hide/);
    await page.getByRole("dialog", { name: "Species choices" }).locator(".card-back-ctl").getByRole("button", { name: "Done" }).click();
    await expect(board).not.toHaveClass(/fly-hide/, { timeout: 4000 });
    await expect(board).toHaveClass(/side-left/);
    // × on a new pick puts it back: the species space is empty again.
    await page.locator(".board-acc-head", { hasText: "Species" }).click();
    await page.locator(".board-acc.open .mini-card:not(.picked) .mini-main").first().click();
    await page.getByRole("dialog", { name: "Species choices" }).getByRole("button", { name: "Put it back" }).click();
    await expect(page.getByRole("dialog", { name: "Species choices" })).toHaveCount(0);
    // Moving the mouse out over the cards closes it.
    await page.locator(".board-lib").hover();
    await page.mouse.move(900, 400);
    await expect(board).not.toHaveClass(/side-left/);
    expect(seen.csp).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
  test("See options opens the list, and a second click closes it with its panel (C1.1)", async ({ page }) => {
    await addTestContent(page);
    await page.getByRole("button", { name: /new character/i }).click();
    await tab(page, "Build");
    const board = page.locator(".board");
    const see = page.locator("[data-tile=race]").getByRole("button", { name: /see options/i });
    for (let i = 0; i < 2; i++) {
      await see.click();
      await expect(board).toHaveClass(/side-left/);
      await expect(see).toHaveClass(/\bon\b/);
      await see.click();
      await expect(board).not.toHaveClass(/side-left/);
      await expect(see).not.toHaveClass(/\bon\b/);
    }
  });
});

test("deleting a character asks first, in the app's own dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /new character/i }).click();
  await tab(page, "Build");
  await page.getByLabel("Character name").fill("Doomed Dave");
  await tab(page, "Home");
  const cards = page.locator(".char-card", { hasText: "Doomed Dave" });
  await expect(cards).toHaveCount(1);
  await cards.first().hover();
  await page.getByRole("button", { name: /^Delete / }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("cannot be undone");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(cards).toHaveCount(1);
  await cards.first().hover();
  await page.getByRole("button", { name: /^Delete / }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete character" }).click();
  await expect(cards).toHaveCount(0);
});

test("Report a bug shows what would be sent, with each part optional", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^menu/i }).click();
  await page.getByRole("button", { name: /report a bug/i }).click();
  const dialog = page.getByRole("dialog", { name: "Report a bug" });
  await expect(dialog).toContainText("Rules check of the current character");
  await expect(dialog).toContainText("App version and system");
  await dialog.getByRole("textbox").fill("The longbow is missing from my attacks.");
  await expect(dialog.getByRole("button", { name: "Open a GitHub issue" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save report to file" })).toBeVisible();
  await expect(dialog).not.toContainText("/Users/");
});
