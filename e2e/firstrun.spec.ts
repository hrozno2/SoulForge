import { expect, test } from "@playwright/test";
import { addTestContent, randomCharacter, tab, watchProblems } from "./helpers";

// Stage D2: a new install has the free SRD rules, with nothing imported, and says where they come from.
test("a character can be built from the built-in rules alone", async ({ page }) => {
  const seen = watchProblems(page);
  await page.goto("/");
  await expect(page.locator(".callout")).toContainText("The free rules are ready");
  await randomCharacter(page, 5);
  await tab(page, "Play");
  await expect(page.locator(".play-id h1")).toHaveText(/random adventurer/i);
  await expect(page.locator(".ab-row .ab-box")).toHaveCount(6);
  await tab(page, "Sheet");
  await expect(page.locator("main")).toBeVisible();
  expect(seen.csp).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("the built-in rules' attribution is word for word in Settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^menu/i }).click();
  await page.getByRole("button", { name: /^Settings/ }).click();
  await expect(page.getByText("This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”)", { exact: false })).toBeVisible();
  await expect(page.getByText("This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”)", { exact: false })).toBeVisible();
});

test("the built-in rules sit beside added content", async ({ page }) => {
  const seen = watchProblems(page);
  await addTestContent(page, { keepSrd: true });
  await randomCharacter(page);
  await tab(page, "Play");
  await expect(page.locator(".play-id h1")).toHaveText(/random adventurer/i);
  expect(seen.errors).toEqual([]);
});
