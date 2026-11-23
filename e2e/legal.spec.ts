import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { newCharacter } from "../src/aurora/character";
import { tab, stored } from "./helpers";

// Chris, 2026-11-23: a character the rules check flags is made rules legal in one screen. The player decides what is
// theirs to decide, sees what changed, and the changes go into the character's journal.
test.use({
  viewport: { width: 1600, height: 900 },
  storageState: stored({ reduceMotion: true }),
});

type El = { id: string; name: string; type: string; source: string; compendiumHidden?: boolean };
const bundle = (v: string) => (JSON.parse(readFileSync(`public/srd/srd-${v}.json`, "utf8")) as { elements: El[] }).elements;
const pick = (els: El[], type: string, name: string) => els.find((e) => e.type === type && e.name === name && !e.compendiumHidden)!.id;

test("Make it legal: the player's call, what changed, and the journal", async ({ page }) => {
  // A 2024 species with a 2014 background: neither raises a score. One of Chris's own flagged characters is like this.
  const ch = {
    ...newCharacter(),
    name: "Mixed Origins",
    abilityMethod: "manual" as const,
    race: pick(bundle("5.2"), "Race", "Elf"),
    background: pick(bundle("5.1"), "Background", "Acolyte"),
    classes: [{ classId: pick(bundle("5.2"), "Class", "Fighter"), level: 1 }],
  };
  await page.goto("/");
  await page.evaluate((c) => localStorage.setItem("charforge.current.v2", JSON.stringify({ id: "legal-test", ch: c })), ch);
  await page.reload();
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await tab(page, "Build");

  const check = page.locator(".rules-check").first();
  await expect(check).toContainText(/1 to fix/);
  // A character from an older build: the notice says how much no longer lines up and opens the one panel that lists it.
  const notice = page.getByRole("status", { name: "Changes since this character was saved" });
  await expect(notice).toContainText(/no longer lines? up/);
  await notice.getByRole("button", { name: "Show in the rules check" }).click();
  const toFix = check.getByRole("region", { name: "To fix" });
  await expect(toFix).toContainText("Origin editions mixed");
  await expect(toFix.getByRole("button", { name: "Keep as a table ruling" })).toBeVisible();
  await check.getByRole("button", { name: "Got it" }).click();
  await expect(notice).toHaveCount(0);
  await check.getByRole("button", { name: /Make it legal/ }).click();
  const dialog = page.getByRole("dialog", { name: "Make it legal" });
  await expect(dialog).toBeVisible();
  const call = dialog.locator(".legal-call", { hasText: "Origin editions mixed" });
  await expect(call.getByRole("button")).toHaveText(["Use the 2024 rules for Acolyte", "Keep it, as a table ruling"]);
  // Nothing is chosen for the player, and Apply waits for a decision.
  await expect(call.locator(".pill.active")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();

  await call.getByRole("button", { name: "Keep it, as a table ruling" }).click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toContainText("Kept as a table ruling: Origin editions mixed");
  await dialog.locator(".levelup-foot").getByRole("button", { name: "Close" }).click();

  // The finding is a table ruling now: said so, not counted, and it can be taken back.
  await expect(check).toContainText(/table ruling/);
  await expect(check.locator(".rules-check-head")).toContainText("Follows the rules, with 1 table ruling");
  const accepted = check.getByRole("region", { name: "Accepted" });
  await expect(accepted).toContainText("Origin editions mixed");
  await expect(check.getByRole("region", { name: "To fix" })).toHaveCount(0);
  // Taken back, it is to fix again; kept from the panel itself, it is accepted again.
  await accepted.getByRole("button", { name: "Take back" }).click();
  await check.getByRole("region", { name: "To fix" }).getByRole("button", { name: "Keep as a table ruling" }).click();
  await expect(check.getByRole("region", { name: "Accepted" })).toContainText("Origin editions mixed");
  // And the change is in the character's journal, saved with the character.
  const saved = await page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem("charforge.current.v2")!) as {
          ch: { journal?: { title: string; text: string }[]; acceptedFindings?: string[] };
        }
      ).ch,
  );
  expect(saved.journal?.map((j) => j.title)).toEqual(["Rules changes"]);
  expect(saved.journal?.[0].text).toContain("Kept as a table ruling: Origin editions mixed");
  expect(saved.acceptedFindings?.length).toBe(1);
});
