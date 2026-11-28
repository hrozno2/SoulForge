import { expect, test } from "@playwright/test";
import { randomCharacter, reloadWithCurrent, tab, stored } from "./helpers";

// docs/AUDIT-2026-11-10.md, S1 and S2: a save that fails is shown and tried again, never swallowed under "Saved".
test.use({
  storageState: stored({ reduceMotion: true }),
});

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
    // oxlint-disable-next-line typescript/unbound-method -- kept to be put back, called with its own `this`
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
  await page.evaluate(() => {
    const w = window as unknown as { __put: IDBObjectStore["put"] };
    IDBObjectStore.prototype.put = w.__put;
  });
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
  const file = {
    version: 2,
    name: "Dented",
    classes: [{ classId: "NOT_A_CLASS", level: 99 }],
    selections: { "NOT_A_CLASS|0": "one" },
    abilityBase: { strength: "strong" },
    coins: { gp: "many" },
  };
  await page
    .locator('input[type=file][accept=".json"]')
    .first()
    .setInputFiles({ name: "dented.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
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

// S8: the same character open in two tabs. The tab that opened it last saves it; the other says so and saves nothing
// until "Use it here", which reopens the character as the other tab saved it.
test("a character open in two tabs is saved by one of them only", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await randomCharacter(page, 2);
  await tab(page, "Build");
  await page.getByLabel("Character name").fill("Shared One");
  await page.getByLabel("Character name").blur();
  await expect(page.locator(".actionbar .saved")).toHaveText("✓ Saved");

  // A second tab starts on the same open character and claims it.
  const second = await context.newPage();
  await second.goto("/");
  await expect(page.locator(".held-elsewhere")).toBeVisible({ timeout: 30_000 });
  await expect(second.locator(".held-elsewhere")).toHaveCount(0);

  // The first tab's edit is not saved while the second holds it.
  await page.getByLabel("Character name").fill("Edited In The Old Tab");
  await page.getByLabel("Character name").blur();
  await page.waitForTimeout(1500);
  const names = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open("charforge");
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const all = await new Promise<{ name: string }[]>((res, rej) => {
      const q = db.transaction("characters").objectStore("characters").getAll();
      q.onsuccess = () => res(q.result as { name: string }[]);
      q.onerror = () => rej(q.error);
    });
    return all.map((c) => c.name);
  });
  expect(names).toContain("Shared One");
  expect(names).not.toContain("Edited In The Old Tab");

  // Use it here: the first tab takes it back with the saved name, and the second now says it is held elsewhere.
  await page.locator(".held-elsewhere").getByRole("button", { name: "Use it here" }).click();
  await expect(page.locator(".held-elsewhere")).toHaveCount(0);
  await expect(second.locator(".held-elsewhere")).toBeVisible();
  await tab(page, "Build");
  await expect(page.getByLabel("Character name")).toHaveValue("Shared One");
  await second.close();
});

// Audit E6: a character whose portrait is too big for the quick-recovery copy is kept there without the portrait.
// After a sudden quit the newer copy opens, and the portrait comes back from the library; neither is lost.
test("a copy kept without its portrait opens with its edits and gets the portrait back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await randomCharacter(page, 2);
  await tab(page, "Build");
  await page.getByLabel("Character name").fill("Has A Picture");
  await page.getByLabel("Character name").blur();
  await expect(page.locator(".actionbar .saved")).toHaveText("✓ Saved");

  // As it would be after a quit: the library has the saved character with its portrait; the open copy has a newer
  // edit and no portrait.
  const PORTRAIT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const stored = async () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const q = indexedDB.open("charforge");
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
      const all = await new Promise<{ id: string; name: string; data: { name: string; portrait?: string } }[]>((res, rej) => {
        const q = db.transaction("characters").objectStore("characters").getAll();
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
      db.close();
      return all.map((c) => ({ name: c.data.name, portrait: c.data.portrait }));
    });
  const edited = await page.evaluate(async (portrait) => {
    const copy = JSON.parse(localStorage.getItem("charforge.current.v2")!) as { id: string; ch: Record<string, unknown> };
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open("charforge");
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const store = () => db.transaction("characters", "readwrite").objectStore("characters");
    const rec = await new Promise<{ data: Record<string, unknown> }>((res, rej) => {
      const q = store().get(copy.id);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    rec.data.portrait = portrait;
    await new Promise<void>((res, rej) => {
      const q = store().put(rec);
      q.onsuccess = () => res();
      q.onerror = () => rej(q.error);
    });
    db.close();
    const { portrait: _none, ...rest } = copy.ch;
    void _none;
    return JSON.stringify({ id: copy.id, chNoPortrait: { ...rest, name: "Edited After The Last Save" } });
  }, PORTRAIT);
  expect(await stored()).toEqual([{ name: "Has A Picture", portrait: PORTRAIT }]);

  await reloadWithCurrent(page, edited);
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await tab(page, "Build");
  await expect(page.getByLabel("Character name")).toHaveValue("Edited After The Last Save");
  // The library ends with the newer edit and the portrait; the open copy is whole again.
  await expect.poll(stored, { timeout: 15_000 }).toEqual([{ name: "Edited After The Last Save", portrait: PORTRAIT }]);
  const copy = await page.evaluate(
    () => JSON.parse(localStorage.getItem("charforge.current.v2")!) as { ch?: { portrait?: string }; chNoPortrait?: unknown },
  );
  expect(copy.ch?.portrait).toBe(PORTRAIT);
  expect(copy.chNoPortrait).toBeUndefined();
});

// The copy that was open at the last quit, when the library's answer does not go the usual way (found 2026-11-25).
const PICTURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
type Page = import("@playwright/test").Page;

// Every record's name and portrait, read with a cursor (the switch below only breaks getAll, which the app uses).
const library = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open("charforge");
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const out: { name: string; portrait?: string }[] = [];
    await new Promise<void>((res, rej) => {
      const c = db.transaction("characters").objectStore("characters").openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return res();
        const data = (cur.value as { data: { name: string; portrait?: string } }).data;
        out.push({ name: data.name, portrait: data.portrait });
        cur.continue();
      };
      c.onerror = () => rej(c.error);
    });
    db.close();
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });

// While localStorage has "test.libraryUnread", reading the saved characters fails, as a storage in trouble would.
const breakableLibrary = (page: Page) =>
  page.addInitScript(() => {
    // oxlint-disable-next-line typescript/unbound-method -- kept to be called with its own `this`
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["getAll"]>) {
      if (this.name === "characters" && localStorage.getItem("test.libraryUnread"))
        throw new DOMException("the storage is not answering", "UnknownError");
      return getAll.apply(this, args);
    };
  });

// A saved character named `name`; returns the open copy as it is kept without a portrait, renamed to `edited`.
// With `picture`, the library's record has the portrait (as after a quit between a portrait and the next edit).
async function savedThenEdited(page: Page, name: string, edited: string, picture: boolean): Promise<string> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await randomCharacter(page, 2);
  await tab(page, "Build");
  await page.getByLabel("Character name").fill(name);
  await page.getByLabel("Character name").blur();
  await expect(page.locator(".actionbar .saved")).toHaveText("✓ Saved");
  return page.evaluate(
    async ({ edited, portrait }) => {
      const copy = JSON.parse(localStorage.getItem("charforge.current.v2")!) as { id: string; ch: Record<string, unknown> };
      if (portrait) {
        const db = await new Promise<IDBDatabase>((res, rej) => {
          const q = indexedDB.open("charforge");
          q.onsuccess = () => res(q.result);
          q.onerror = () => rej(q.error);
        });
        const store = () => db.transaction("characters", "readwrite").objectStore("characters");
        const rec = await new Promise<{ data: Record<string, unknown> }>((res, rej) => {
          const q = store().get(copy.id);
          q.onsuccess = () => res(q.result);
          q.onerror = () => rej(q.error);
        });
        rec.data.portrait = portrait;
        await new Promise<void>((res, rej) => {
          const q = store().put(rec);
          q.onsuccess = () => res();
          q.onerror = () => rej(q.error);
        });
        db.close();
      }
      const { portrait: _none, ...rest } = copy.ch;
      void _none;
      return JSON.stringify({ id: copy.id, chNoPortrait: { ...rest, name: edited } });
    },
    { edited, portrait: picture ? PICTURE : "" },
  );
}

test("a copy kept without its portrait is saved when the library has no portrait for it either", async ({ page }) => {
  const edited = await savedThenEdited(page, "No Picture Yet", "Edited After The Last Save", false);
  await reloadWithCurrent(page, edited);
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await tab(page, "Build");
  await expect(page.getByLabel("Character name")).toHaveValue("Edited After The Last Save");
  // Nothing came from the library to change the character, and the newer copy still has to reach the library.
  await expect.poll(() => library(page), { timeout: 15_000 }).toEqual([{ name: "Edited After The Last Save", portrait: undefined }]);
});

test("a library that cannot be read at the start says so, keeps the edits, and Try again saves them", async ({ page }) => {
  await breakableLibrary(page);
  const edited = await savedThenEdited(page, "Has A Picture", "Edited After The Last Save", true);
  await page.evaluate(() => localStorage.setItem("test.libraryUnread", "1"));
  await reloadWithCurrent(page, edited);
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await tab(page, "Build");
  // Not "Saved": nothing is written over the library's copy, which has the portrait this one lacks.
  const state = page.locator(".actionbar .saved");
  await expect(state).toContainText("Not saved");
  await page.getByLabel("Character name").fill("Edited While Unread");
  await page.getByLabel("Character name").blur();
  await expect(state).toContainText("Not saved");
  expect(await library(page)).toEqual([{ name: "Has A Picture", portrait: PICTURE }]);
  // The edit is kept on this computer meanwhile, still as a copy without its portrait.
  const kept = await page.evaluate(
    () => JSON.parse(localStorage.getItem("charforge.current.v2")!) as { ch?: unknown; chNoPortrait?: { name: string } },
  );
  expect(kept.ch).toBeUndefined();
  expect(kept.chNoPortrait?.name).toBe("Edited While Unread");

  await page.evaluate(() => localStorage.removeItem("test.libraryUnread"));
  await state.getByRole("button", { name: "Try again" }).click();
  await expect(state).toHaveText("✓ Saved");
  await expect.poll(() => library(page), { timeout: 15_000 }).toEqual([{ name: "Edited While Unread", portrait: PICTURE }]);
});

test("another character opened while the library cannot be read is saved, and the first is left as it was", async ({ page }) => {
  await breakableLibrary(page);
  const edited = await savedThenEdited(page, "Has A Picture", "Edited After The Last Save", true);
  await page.evaluate(() => localStorage.setItem("test.libraryUnread", "1"));
  await reloadWithCurrent(page, edited);
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 60_000 });
  await randomCharacter(page, 2);
  await tab(page, "Build");
  await page.getByLabel("Character name").fill("The Second One");
  await page.getByLabel("Character name").blur();
  await expect(page.locator(".actionbar .saved")).toHaveText("✓ Saved");
  expect(await library(page)).toEqual([
    { name: "Has A Picture", portrait: PICTURE },
    { name: "The Second One", portrait: undefined },
  ]);
});
