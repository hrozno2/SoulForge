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
    // Clicking the card turns it over to edit; × undoes nothing that was not changed, and closes it.
    await page.locator("[data-tile=race] .chosen-banner").click();
    await expect(backside).toBeVisible();
    await backside.getByRole("button", { name: "Undo the changes" }).click();
    await expect(backside).toHaveCount(0);
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
