import { expect, test } from "@playwright/test";
import { stored } from "./helpers";

// Chris, 2026-11-23: on first launch the tutorial asks whether the player is new to D&D and offers to guide them
// through a first character: plain questions, recommendations, and the player does the choosing on the real board.
test.use({
  viewport: { width: 1600, height: 900 },
  storageState: stored({ reduceMotion: true }, { tutorial: true }),
});

test("the tutorial guides a new player through a first character", async ({ page }) => {
  await page.goto("/");
  // First launch: the tutorial opens by itself and offers the guide.
  const offer = page.getByRole("button", { name: "Guide me through my first character" });
  await expect(offer).toBeVisible({ timeout: 60_000 });
  await offer.click();
  const coach = page.getByRole("region", { name: "Guide: your first character" });
  await expect(coach).toBeVisible();
  await expect(coach).toContainText("Step 1 of 7");

  // Two plain questions; nothing moves on until both are answered.
  await coach.getByRole("button", { name: "Hitting things, and taking hits" }).click();
  await expect(coach).toContainText("Step 1 of 7");
  await coach.getByRole("button", { name: "As little as possible" }).click();
  await expect(coach).toContainText("Pick a class");
  await expect(coach.locator(".guide-recs li b")).toHaveText(["Fighter", "Barbarian", "Monk"]);
  // The recommended classes carry the guide's mark in the list itself; the rest do not.
  await page.locator(".board-acc-head", { hasText: "Class" }).click();
  const cards = page.locator(".board-acc.open .mini-card");
  // (The list keeps its own order, so the names are compared as a set.)
  await expect
    .poll(async () =>
      (await cards.filter({ hasText: "Guide's pick" }).locator(".mini-name").allInnerTexts()).map((t) => t.toLowerCase()).sort(),
    )
    .toEqual(["barbarian", "fighter", "monk"]);

  // The player does the picking, on the real board; the guide moves on when it is done.
  const pickFrom = async (list: string, name: string, kind: string) => {
    // The board opens the next list by itself after a pick: open it only when it is not open already.
    const open = page.locator(".board-acc.open", { has: page.locator(".board-acc-head", { hasText: list }) });
    if (!(await open.count())) await page.locator(".board-acc-head", { hasText: list }).click();
    await page.locator(".board-acc.open .mini-card", { hasText: name }).first().locator(".mini-main").click();
    const fresh = page.locator(`.float-window.card-window-${kind}`);
    await expect(fresh).toBeVisible();
    await fresh.getByRole("button", { name: /^Apply / }).click();
    await expect(fresh).toHaveCount(0);
  };
  await pickFrom("Class", "Fighter", "class");
  await expect(coach).toContainText("Pick a species");
  await expect(coach.locator(".guide-recs li b")).toHaveText(["Human", "Orc", "Dwarf"]);
  await pickFrom("Species", "Human", "race");
  await expect(coach).toContainText("Pick a background");
  await expect(coach.locator(".guide-recs li b")).toHaveText(["Soldier"]);
  await pickFrom("Background", "Soldier", "background");

  // Scores: one click places the recommended spread, a Fighter's best score on Strength.
  await expect(coach).toContainText("Set your ability scores");
  await coach.getByRole("button", { name: "Use the recommended spread" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const ch = (
          JSON.parse(localStorage.getItem("charforge.current.v2")!) as {
            ch: { abilityMethod: string; abilityBase: Record<string, number> };
          }
        ).ch;
        return `${ch.abilityMethod} ${ch.abilityBase.strength} ${ch.abilityBase.intelligence}`;
      }),
    )
    .toBe("standard 15 8");
  // Then the cards' own choices, counted for the player.
  await expect(coach).toContainText(/Your cards still ask \d+ things?/);

  // Closing the guide keeps the character.
  await coach.getByRole("button", { name: "Close the guide" }).click();
  await expect(coach).toHaveCount(0);
  await expect(page.locator("[data-tile=class] h3")).toHaveText("Fighter");
});

test("the guide starts from the menu too, and its marks go when it is closed", async ({ browser }) => {
  const context = await browser.newContext({ storageState: stored({ reduceMotion: true }), viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("button", { name: /^menu/i }).click();
  await page.getByRole("button", { name: "Guide me through a first character" }).click();
  const coach = page.getByRole("region", { name: "Guide: your first character" });
  await coach.getByRole("button", { name: "Casting spells" }).click();
  await coach.getByRole("button", { name: "As little as possible" }).click();
  await expect(coach).toContainText("Pick a class");
  await page.locator(".board-acc-head", { hasText: "Class" }).click();
  await expect(page.locator(".board-acc.open .guide-mark").first()).toBeVisible();
  await coach.getByRole("button", { name: "Close the guide" }).click();
  await expect(page.locator(".guide-mark")).toHaveCount(0);
  await context.close();
});
