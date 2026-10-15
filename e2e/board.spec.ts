import { expect, test } from "@playwright/test";
import { addTestContent, tab, watchProblems, randomCharacter } from "./helpers";

// The build board, the default Build layout.
test.use({ storageState: { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "charforge.tutorial", value: "never" }, { name: "charforge.settings", value: JSON.stringify({ buildLayout: "board" }) }] }] } });

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
    const rows = page.locator(".board-acc.open .opt-row:not(.picked) .opt-name");
    const name = (await rows.first().textContent())!.trim();
    await rows.first().click();
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
