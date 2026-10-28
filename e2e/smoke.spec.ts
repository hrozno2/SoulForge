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
    // Manage and Content are two plain top-level tabs (C2), not one menu.
    const nav = page.locator("header nav");
    await expect(nav.getByRole("button", { name: /^Manage/ })).not.toHaveAttribute("aria-haspopup", "menu");
    await expect(nav.getByRole("button", { name: /^Content/ })).toBeVisible();
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
    await expect(page.locator(".ab-row .ab-box")).toHaveCount(6);
    await expect(page.locator(".hp-bar")).toBeVisible();
    // Roll an ability check: the dice panel opens with a result card.
    await page.locator(".ab-box").first().click();
    await expect(page.locator(".roll-card .roll-total")).toBeVisible();
    expect(seen.csp).toEqual([]);
    expect(seen.errors).toEqual([]);
  });

  test("home cards are drawn once, with their class, and never change after landing (C1.6)", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page, 3);
    await tab(page, "Home");
    await page.reload();
    // The first moment any card is in the page, its look and text; the same a few seconds later.
    await page.waitForSelector(".char-cards > .char-card", { timeout: 30_000 });
    const look = () => page.$$eval(".char-cards > .char-card .char-card-body", (cards) => cards.map((c) => `${(c as HTMLElement).style.getPropertyValue("--hue")}|${c.querySelector(".char-card-what")?.textContent}|${c.querySelector(".char-card-stats")?.textContent ?? ""}`));
    const first = await look();
    expect(first.every((x) => !/Nothing chosen yet|^\|/.test(x))).toBe(true);
    await page.waitForTimeout(3000);
    expect(await look()).toEqual(first);
  });

  test("Play sets and adds experience and opens the hit point rolls (moved from Manage, C2)", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page, 3);
    await tab(page, "Play");
    await page.getByRole("button", { name: /^Change experience points/ }).click();
    await page.getByLabel("Experience points", { exact: true }).fill("900");
    await page.getByLabel("Add", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Add XP" }).click();
    await expect(page.getByLabel("Experience points", { exact: true })).toHaveValue("1000");
    await page.getByRole("button", { name: "Hit point rolls" }).click();
    const dialog = page.getByRole("dialog", { name: "Hit points" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Rolled" }).click();
    await expect(dialog.getByLabel("Roll for level 2")).toBeVisible();
  });

  test("favorites reorder with their move buttons and by dragging within the row (C2)", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page, 5);
    await tab(page, "Play");
    const bar = page.getByRole("region", { name: "Favorites" });
    await page.locator(".play-tabs").getByRole("button", { name: /^Features/ }).click();
    const rows = page.locator(".play-body .feature-row");
    const n = Math.min(3, await rows.count());
    test.skip(n < 2, "the random character has fewer than two features");
    for (let i = 0; i < n; i++) await rows.nth(i).getByRole("button", { name: "Add to favorites" }).click();
    const tiles = bar.locator(".fav-tile");
    await expect(tiles).toHaveCount(n);
    const order = async () => (await tiles.allTextContents()).map((t) => t.replace(/[×◂▸]/g, "").trim().slice(0, 24));
    const start = await order();
    // The keyboard way: the first moves one later.
    await tiles.nth(0).hover();
    await tiles.nth(0).getByRole("button", { name: "Move later" }).click();
    await expect.poll(order).toEqual([start[1], start[0], ...start.slice(2)]);
    // Drag the last onto the left half of the first: it goes first, and nothing is added.
    const from = (await tiles.nth(n - 1).boundingBox())!;
    const to = (await tiles.nth(0).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + 12);
    await page.mouse.down();
    await page.mouse.move(to.x + 8, to.y + to.height / 2, { steps: 12 });
    await page.mouse.move(to.x + 6, to.y + to.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect(tiles).toHaveCount(n);
    const now = await order();
    expect(now[0]).toBe((n === 2 ? [start[1], start[0]] : [start[1], start[0], ...start.slice(2)])[n - 1]);
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
    await tab(page, "Export");
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
    // Conditions have their own Play tab (C2; they left Manage).
    await page.locator(".play-tabs").getByRole("button", { name: "Conditions" }).click();
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
    // The character's books moved from Manage to Content (C2).
    await tab(page, "Content");
    await expect(page.getByRole("heading", { name: /^Books for/ })).toBeVisible();
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
    await expect(page.locator("header nav")).toContainText("Aufbau");
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
    // A random character arrives with its starting gear; starting over takes it back out (adding it again must not
    // double it).
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await page.locator(".equip-done").getByRole("button", { name: "Start over" }).click();
    await expect(page.locator("table tbody tr")).toHaveCount(0);
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
    // A resource shows above the tabs, on every tab.
    const strip = page.locator(".res-strip");
    await page.locator(".play-tabs").getByRole("button", { name: "Resources" }).click();
    await page.getByRole("button", { name: "Add resource" }).click();
    await page.getByLabel("Resource name").fill("Ki");
    await expect(strip.getByText("Ki")).toBeVisible();
    await page.locator(".play-tabs").getByRole("button", { name: "Notes" }).click();
    await expect(strip.getByText("Ki")).toBeVisible();
    // Star a feature, then drag another in.
    await page.locator(".play-tabs").getByRole("button", { name: /^Features/ }).click();
    const rows = page.locator(".play-body .feature-row");
    await rows.nth(0).getByRole("button", { name: "Add to favorites" }).click();
    await expect(bar.locator(".fav-tile.feature")).toHaveCount(1);
    if ((await rows.count()) > 1) {
      // Drag the way a person does: press, move over the favorites in steps, let go.
      const from = (await rows.nth(1).boundingBox())!;
      const to = (await bar.boundingBox())!;
      await page.mouse.move(from.x + 20, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + 10, { steps: 12 });
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
      await page.mouse.up();
      await expect(bar.locator(".fav-tile.feature")).toHaveCount(2);
      // A second drag, dropped low in the panel, lands too.
      if ((await rows.count()) > 2) {
        const f2 = (await rows.nth(2).boundingBox())!;
        const t2 = (await bar.boundingBox())!;
        await page.mouse.move(f2.x + 20, f2.y + f2.height / 2);
        await page.mouse.down();
        await page.mouse.move(t2.x + t2.width / 2, t2.y + t2.height - 30, { steps: 12 });
        await page.mouse.move(t2.x + t2.width / 2, t2.y + t2.height - 20, { steps: 4 });
        await page.mouse.up();
        await expect(bar.locator(".fav-tile.feature")).toHaveCount(3);
      }
    }
    // Favorites are kept with the character; the sidebar can switch to the skills and back.
    await page.reload();
    await tab(page, "Play");
    await expect(page.locator(".res-strip").getByText("Ki")).toBeVisible();
    // A favorite can be taken off again.
    const favTiles = page.getByRole("region", { name: "Favorites" }).locator(".fav-tile.feature");
    const before = await favTiles.count();
    await page.getByRole("region", { name: "Favorites" }).getByRole("button", { name: "Remove from favorites" }).first().click();
    await expect(favTiles).toHaveCount(before - 1);
    await page.getByRole("tab", { name: "Skills" }).click();
    await expect(page.locator(".play-side .skill-line").first()).toBeVisible();
    await page.getByRole("tab", { name: /Favorites/ }).click();
    await expect(page.getByRole("region", { name: "Favorites" })).toBeVisible();
  });

  test("a form can come from a creature, shows its stat block, and polymorph ties to concentration", async ({ page }) => {
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Play");
    await page.locator(".play-tabs").getByRole("button", { name: "Extras" }).click();
    await page.getByLabel("Kind of form").selectOption("polymorph");
    await page.getByLabel("Find a creature").fill("cave");
    await page.getByRole("button", { name: /Cave Hound/ }).click();
    // The form worked out for the character (C5.3): under Polymorph the beast's own numbers.
    await expect(page.locator(".forms-panel .form-card")).toContainText("Polymorph");
    await expect(page.locator(".forms-panel .form-card")).toContainText("13");
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

  test.describe("tutorial", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test("opens for everyone, can be skipped, comes back next time, and never shows again when asked", async ({ page }) => {
      await page.goto("/");
      const dialog = page.getByRole("dialog", { name: "Tutorial" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Welcome to Soul Forge");
      await dialog.getByRole("button", { name: "Start" }).click();
      await expect(dialog).toContainText("Add rules content from Aurora");
      await expect(dialog.getByRole("button", { name: "Download rules content" })).toBeVisible();
      // Skipping closes it for now only.
      await dialog.getByRole("button", { name: "Skip for now" }).click();
      await expect(dialog).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("dialog", { name: "Tutorial" })).toBeVisible();
      // A step can take you where it is talking about, and the tutorial waits for you instead of vanishing.
      await page.getByRole("button", { name: "Start" }).click();
      await page.getByRole("button", { name: "Next" }).click();
      // The rules step: a choice that applies at once and is saved in Settings.
      await expect(page.getByRole("dialog", { name: "Tutorial" })).toContainText("Which rules to show");
      await page.getByRole("button", { name: "2024 rules only" }).click();
      await page.getByRole("button", { name: "2024 and 2014 rules" }).click();
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Open the importer" }).click();
      await expect(page.getByRole("dialog", { name: "Tutorial" })).toHaveCount(0);
      await expect(page.getByText("Tutorial, step 4 of 7")).toBeVisible();
      await page.getByRole("button", { name: "Resume" }).click();
      await expect(page.getByRole("dialog", { name: "Tutorial" })).toContainText("Import from 5e.tools");
      await page.getByRole("button", { name: "Minimize the tutorial" }).click();
      await page.getByRole("button", { name: "Close the tutorial" }).click();
      await page.reload();
      await page.getByRole("dialog", { name: "Tutorial" }).getByRole("button", { name: "Never show this again" }).click();
      await page.reload();
      await expect(page.getByRole("dialog", { name: "Tutorial" })).toHaveCount(0);
      // It is still there under the menu.
      await page.getByRole("button", { name: /^menu/i }).click();
      await page.getByRole("button", { name: "Show the tutorial" }).click();
      await expect(page.getByRole("dialog", { name: "Tutorial" })).toBeVisible();
    });
  });

  test("a loaded sheet previews filled in with page buttons, and the same sheet is not kept twice", async ({ page }, info) => {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    // A small fillable sheet with the field names of the classic 2014 sheet, made here so no one else's file is needed.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let n = 0; n < 2; n++) {
      const pg = doc.addPage([612, 792]);
      pg.drawText(`Test sheet page ${n + 1}`, { x: 40, y: 740, size: 14, font });
      if (n === 0) {
        const f = doc.getForm();
        for (const [i, name] of ["CharacterName", "Wpn Name", "ClassLevel", "Race"].entries()) f.createTextField(name).addToPage(pg, { x: 40, y: 700 - i * 30, width: 200, height: 20 });
      }
    }
    const file = info.outputPath("classic-test.pdf");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, await doc.save());
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Export");
    await page.getByRole("button", { name: "Export PDF..." }).click();
    const choose = async () => {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Add PDF..." }).click()]);
      await chooser.setFiles(file);
    };
    await choose();
    await expect(page.getByText(/classic 2014|fillable sheet/i).first()).toBeVisible();
    await expect(page.locator(".sheet-preview img")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    // Adding the very same file again keeps one copy.
    await choose();
    await expect(page.getByText(/already added|replaced/i).first()).toBeVisible();
    expect(await page.locator("option", { hasText: /Classic 2014/ }).count()).toBe(1);
    // The manager shows every sheet with a picture of its first page and can remove one.
    await page.getByRole("button", { name: /Manage sheets/ }).click();
    const manager = page.getByRole("dialog", { name: "Manage sheets" });
    await expect(manager.locator(".sheet-thumb img")).toBeVisible({ timeout: 30_000 });
    await expect(manager.locator(".sheet-grid").getByText(/2 pages/)).toBeVisible();
    await manager.getByRole("button", { name: "Remove..." }).click();
    await manager.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(manager.getByText("No sheets yet.")).toBeVisible();
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
    await page.locator(".hero-icons").getByRole("button", { name: "Level up" }).click();
    const dialog = page.getByRole("dialog", { name: "Level up" });
    await dialog.getByRole("button", { name: "Level up" }).first().click();
    await expect(dialog.getByText("Hit points", { exact: true })).toBeVisible();
    await expect(dialog.locator(".lu-tile.hp b")).toHaveText(/^[+-]?\d+$/);
    expect(await level()).toBe(start + 1);
    await dialog.getByRole("button", { name: /undo this level/i }).click();
    await expect(dialog).toHaveCount(0);
    expect(await level()).toBe(start);
    // Doing it again and finishing keeps the level.
    await page.locator(".hero-icons").getByRole("button", { name: "Level up" }).click();
    await dialog.getByRole("button", { name: "Level up" }).first().click();
    await dialog.locator("button.primary", { hasText: "Done" }).click();
    expect(await level()).toBe(start + 1);
  });
  test("an import report is kept with the character and can be added to the notes", async ({ page }) => {
    const seen = watchProblems(page);
    await addTestContent(page);
    const foundry = {
      name: "Imported Ira", type: "character", system: { abilities: { str: { value: 14 } }, details: {} },
      items: [
        { name: "Warden", type: "class", system: { levels: 2 } },
        { name: "Hollowfolk", type: "race", system: {} },
        { name: "Wayfarer", type: "background", system: {} },
        { name: "Mystery Trinket", type: "loot", system: { quantity: 1 } },
      ],
    };
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /import foundry/i }).click();
    await (await chooser).setFiles({ name: "ira.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(foundry)) });
    const report = page.getByRole("dialog", { name: /import report/i });
    await expect(report).toContainText("Mystery Trinket");
    await report.getByText("Close", { exact: true }).click();
    // The notice points to Import notes on Build, which shows the kept report and adds it to the notes.
    const notice = page.locator(".notice-toast");
    await expect(notice).toContainText(/Import notes/);
    await notice.getByRole("button", { name: /show import notes/i }).click();
    const kept = page.getByRole("dialog", { name: "Import notes" });
    await expect(kept).toContainText("Mystery Trinket");
    await kept.getByRole("button", { name: "Add to notes" }).click();
    await expect(page.locator(".notice-toast")).toContainText(/character's details/);
    await page.locator(".notice-toast").getByRole("button", { name: /open notes/i }).click();
    await expect(page.locator("#character-notes")).toHaveValue(/Import notes: ira\.json[\s\S]*Mystery Trinket/);
    await page.getByRole("dialog", { name: "Character details" }).getByRole("button", { name: "Close" }).click();
    // The button stays on Build, and the report is not added twice.
    await tab(page, "Build");
    await page.getByRole("toolbar", { name: "Character actions" }).getByRole("button", { name: "Import notes" }).click();
    await expect(page.getByRole("dialog", { name: "Import notes" }).getByRole("button", { name: "Already in the notes" })).toBeDisabled();
    expect(seen.csp).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
  test("the rules check on Build says whether the character follows the rules", async ({ page }) => {
    const seen = watchProblems(page);
    await addTestContent(page);
    await randomCharacter(page);
    await tab(page, "Build");
    const bar = page.getByRole("region", { name: "Rules check" });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(/follows the rules|against the rules|content problem/i);
    await page.screenshot({ path: "test-results/rules-check.png" });
    expect(seen.csp).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
});
