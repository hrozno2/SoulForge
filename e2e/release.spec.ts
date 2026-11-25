import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { newCharacter } from "../src/aurora/character";
import { reloadWithCurrent, stored, tab, watchProblems } from "./helpers";

// Stage D7 (Chris 2026-11-23): the release app reads no Aurora content and offers no way to add it. Aurora's files
// already on the computer are left alone, and a character built on them is offered the move to 5e.tools.
test.use({ viewport: { width: 1600, height: 900 }, storageState: stored({ reduceMotion: true }) });

const ROOT = "https://fixtures.soulforge.test/demo.index";
const FILE = "https://fixtures.soulforge.test/content/classes.xml";

/** An Aurora index link as an earlier version stored it: the source (no format, as Aurora's always were) and a file. */
async function seedAuroraLink(page: Page) {
  const xml = readFileSync("fixtures/content/classes.xml", "utf8");
  await page.evaluate(
    async ({ root, file, text }) => {
      const db = await new Promise<IDBDatabase>((ok, no) => {
        const req = indexedDB.open("charforge");
        req.onsuccess = () => ok(req.result);
        req.onerror = () => no(req.error);
      });
      const tx = db.transaction(["sources", "files"], "readwrite");
      tx.objectStore("files").put({ url: file, text, root });
      tx.objectStore("sources").put({
        url: root,
        name: "demo.index",
        kind: "link",
        disabled: [],
        versions: {},
        lastChecked: Date.now(),
        fileCount: 1,
        tree: { url: root, name: "Hollow Realms Starter Set", description: "", version: "1.0.0", files: [file], children: [] },
      });
      await new Promise<void>((ok, no) => {
        tx.oncomplete = () => ok();
        tx.onerror = () => no(tx.error);
      });
      db.close();
    },
    { root: ROOT, file: FILE, text: xml },
  );
}

test("the Content tab offers no Aurora import", async ({ page }) => {
  const seen = watchProblems(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await tab(page, "Content");
  await expect(page.getByRole("heading", { name: "Rules content" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /5etools data/ })).toBeVisible();
  await expect(page.getByPlaceholder("https://.../something.index")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /add link/i })).toHaveCount(0);
  await expect(page.getByLabel("Choose element files or a ZIP")).toHaveCount(0);
  await expect(page.getByLabel("Element XML")).toHaveCount(0);
  await expect(page.getByText("Aurora content on this computer")).toHaveCount(0);
  expect(seen.errors).toEqual([]);
});

test("Aurora files from an earlier version are kept but not read, and their characters are offered the move", async ({ page }) => {
  const seen = watchProblems(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await seedAuroraLink(page);
  // A character built on Aurora's Fighter, as an earlier version saved it.
  const ch = {
    ...newCharacter(),
    name: "Old Guard",
    classes: [{ classId: "ID_WOTC_PHB_CLASS_FIGHTER", level: 3 }],
    race: "ID_WOTC_PHB_RACE_HUMAN",
  };
  await reloadWithCurrent(page, JSON.stringify({ id: "aurora-test", ch }));
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });

  // The link's files are on the computer, said so on the Content tab, and none of their content is in the lists.
  await tab(page, "Content");
  const kept = page.getByRole("region", { name: "Aurora content, not read" });
  await expect(kept).toContainText("no longer reads Aurora's content");
  await expect(kept).toContainText("demo.index");
  await expect(kept.getByRole("button", { name: "Remove" })).toBeVisible();
  await page.getByPlaceholder("Search by name").fill("Warden");
  await expect(page.getByPlaceholder("Search by name")).toHaveValue("Warden");
  await expect(page.locator(".card", { hasText: "Browse content" }).getByText("Hollow Realms")).toHaveCount(0);

  // The character says what happened and offers the move; nothing is deleted.
  await tab(page, "Build");
  const notice = page.getByRole("status", { name: "Built on Aurora content" });
  await expect(notice).toContainText("Old Guard was built on Aurora content");
  await expect(notice).toContainText("Nothing is lost");
  await notice.getByRole("button", { name: "Move to 5e.tools" }).click();
  await expect(page.getByRole("dialog", { name: "Move to 5e.tools" })).toBeVisible();
  const sources = await page.evaluate(
    () =>
      new Promise<number>((ok) => {
        const req = indexedDB.open("charforge");
        req.onsuccess = () => {
          const all = req.result.transaction("sources").objectStore("sources").getAll();
          all.onsuccess = () => ok(all.result.length);
        };
      }),
  );
  expect(sources).toBe(1);
  expect(seen.csp).toEqual([]);
});

test("the tutorial has no Aurora step", async ({ browser }) => {
  const context = await browser.newContext({ storageState: stored({ reduceMotion: true }, { tutorial: true }) });
  const page = await context.newPage();
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Tutorial" });
  await expect(dialog).toContainText("The free rules (SRD 5.1 and 5.2.1) come with it");
  await expect(dialog).toContainText("Step 1 of 6");
  await dialog.getByRole("button", { name: "Start" }).click();
  await expect(dialog.getByRole("heading")).toHaveText("1. Which rules to show");
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByRole("heading")).toHaveText("2. Import from 5e.tools or Plutonium");
  await expect(dialog).not.toContainText("Aurora");
  await context.close();
});
