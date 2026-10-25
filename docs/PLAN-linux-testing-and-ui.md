# Plan: CachyOS test findings and interface rework

Written 2026-10-25 from Chris's notes after testing on CachyOS. File references come from reading the repo at commit e11f027. Anything marked **Unverified** is a hypothesis to check before coding, not a finding.

How to use this on the Mac: `git pull`, open Claude Code in the repo root, and say "implement stage N of docs/PLAN-linux-testing-and-ui.md". Do one stage per session. Each stage ends with `npm run build`, `npm test`, a Playwright run (`npm run test:e2e`), a CHANGELOG line, and a commit. Stop after each stage so usage can be checked (see the budget section).

Conventions to keep (from docs/CODE-GUIDE.md): fix causes, not symptoms; add a test that would catch the whole class of mistake; comments say why; choices the rules do not settle stay open for the user.

---

## Stage 0: Linux findings (small fixes plus investigation)

### 0.1 Lag spikes
**Unverified.** Candidates, in order of how cheap they are to check:
- `resolve(character, content.reg)` runs in a `useMemo` in `src/ui/App.tsx` on every character change, and it loops until the result stops changing. Typing in the name field (`board-name` in `BuildBoard.tsx`) changes the character on every keystroke, so the whole resolve runs per key. Check by profiling a keystroke.
- `BuildBoard.tsx` is 1,185 lines in one module. Check whether the whole board re-renders on every change.
- Heavy CSS animation on WebKitGTK (box-shadow, filters, the card glow). `src-tauri/src/main.rs` already sets `WEBKIT_DISABLE_DMABUF_RENDERER`, so a rendering workaround exists; find out why it was added and whether it is now the cause.

Work: get a repro with the React Profiler and a WebKit inspector timeline, record which of the three it is, then fix that one. Likely fixes: keep the name (and other text fields) out of the `resolve` inputs or debounce them, memoize board spaces, and trim animated properties to transform and opacity.
Exit: a note in the commit message saying what the cause was, plus a unit test or timing guard if the cause was in `resolve`.

### 0.2 Yellow placeholder cards on load
Seen while updating 5e.tools files and after relaunch. `LaunchIntro.tsx` promises that cards that land are final.
**Unverified hypothesis:** the home screen draws character cards before `content.reg` holds the content, so `resolve` returns a character with no known class or species. The card then shows a default look (yellow) until the registry fills in, then swaps. This fits "during updating files" and "after relaunch".
Work: confirm by logging `content.ready` and the registry size at the first card render. If it holds, gate card drawing and `launchReady()` on the registry being ready for that character's class and species ids, and keep the pack closed until then. Add an e2e check that no card changes its class label or colour after landing.

### 0.3 Generic items in packs ("a musical instrument")
`src/aurora/startingEquipment.ts` (around lines 500 to 530) resolves "Musical Instrument (one of your choice)", gaming sets and artisan tools only from proficiencies the character already picked. Pack and equipment lines with no matching pick end up in the inventory as the literal text.
Work: when a line names a category and nothing resolves it, create an open choice instead of writing the text. The picker lists items whose category is "Musical Instruments" (`CATEGORY` map in `src/ui/Browse.tsx`), and the same for gaming sets and artisan tools. Until chosen, the starting equipment shows as one pending choice (it already feeds `equipPending` in `App.tsx`). Add tests next to `startingEquipment.test.ts` for each category and for "same as above" lines.

### 0.4 Window frame flicker between dim and bright
No focus or blur handling exists in `src/` (checked by search), so this is probably the native window, not the web page.
**Unverified:** the GTK titlebar or border switches between active and inactive styles as focus moves (for example, when a dialog or the updater touches focus). `tauri.conf.json` sets no `decorations`, so the system frame is used.
Work: first collect the facts: desktop environment, X11 or Wayland, and whether it flickers with the updater banner or a file dialog open. Then try the cheapest fix that matches: a fixed window theme in the Tauri window config, or `decorations: false` with an in-app title bar (drag region, minimize, maximize, close) so the frame no longer has an inactive state. The in-app bar is a bigger change; only do it if the cheap options fail.

---

## Stage 1: Navigation and Manage cleanup (mostly moving code)

Do these together because they all edit `ManageTab.tsx`, `App.tsx` and `TopBar.tsx`.

1. **Manage and Content become two top-level items.** In `App.tsx` the `GroupNav` currently builds a "Manage" group holding `manage` and `content` (around line 226). Make them separate plain tabs.
2. **Sources moves from Manage to Content.** Move the `Sources` component from `ManageTab.tsx` into `ContentTab.tsx`; drop `"sources"` from `SUBS`.
3. **Remove "Level and hit points" from Manage, after a parity check.** The Manage version has: the XP-versus-level note, a "Level up..." button (fires `cf-levelup`), and per-level hit point rolls with "Roll" and "Roll the rest". Check each against `LevelUp.tsx`, `HpRolls.tsx`, and the Play tab's level up and HP controls. List any missing feature, add it to the other places first, then delete the Manage section. Write the parity table in the commit message.
4. **Conditions leave Manage.** Add a Conditions tab inside Play and render `ConditionsPanel` there; remove the `conditions` sub from `SUBS`. Check anything that deep-links to the Manage conditions sub.
5. **Character details move to Build.** On the board next to the portrait, to the right of the species and class text, add a pencil button labelled "Details" that opens the details editor (the `info` sub today). Details must also be editable from the description area in Play.
   - If details are blank, show a line under the green "every choice is made" message saying details are at their defaults.
   - Blank details must not count as an open choice. They must not appear in `pendingList` in `App.tsx` and must not block the "all done" state. Add a test for this.
6. **Remove the right-hand helper lore panel from Manage.** Replace it with a small "i" icon on items the player may want to read about (items from 5e.tools or Aurora). The icon opens the existing detail panel (`onDetail`). The `Learn.tsx` popup stays.
7. **Favorites reorder in Play.** Favorites are an ordered array in `ch.favorites` (`PlayTab.tsx`, `favDrag`, `readFav`). Dropping on the row currently appends. Add an insertion index: show a drop marker between items, insert at that index, and let existing favorites be dragged to a new position (same mime type, with the item's uid, so a move is not treated as an add). Keep the plain-text drag fallback, since the desktop web view only passes plain text. Keyboard alternative: move up and move down buttons.

Exit: e2e covers the new top-level tabs and the favorite reorder; the old Manage subs no longer exist; no dead imports.

---

## Stage 2: Backpack card with Inventory and Shop tabs

The backpack card on the board opens into two tabs.

- **Inventory:** manage what the character has. Sell items to the shop (adds coins), add custom items, edit quantities. Reuses `EquipmentTab.tsx` logic where it fits.
- **Shop:** buy items from the loaded content, with search and category filters. Price shown is the base cost times the multiplier. Buying subtracts coins and adds the item; block or warn when coins are short.
- **Price multiplier:** one number, default 1.0, so a DM can make buying harder or easier. Selling value should follow it too, with a decision below.

Decisions to make before coding (ask Chris if unclear):
- Where the multiplier lives: per character (simple, in `Character`, needs `normalizeCharacter` upgrade) or an app-wide setting. Per character is the default suggestion because DMs set it per table and characters are per table.
- Whether selling pays half the base price at multiplier 1 (the usual table rule) and how the multiplier affects it.
- How coins convert: use the existing coin fields in `character.ts`; make change in the largest denominations that fit, and test it.

Exit: unit tests for price, change and sell math; an e2e that buys and sells; `normalizeCharacter` handles old saves.

---

## Stage 3: Multiple floating cards and the Bag of Holding

The largest piece. Do a short design pass first and show Chris the state model before building the UI.

Behaviour as requested:
- Up to 10 cards open at once, of any mix (5 classes, 5 species, 2 species plus the backpack, and so on).
- Cards are floating windows inside the app: draggable, can sit next to each other, rearrangeable.
- A card can be minimized into the **Bag of Holding**, bottom left. Cards in the bag look slightly desaturated. Dragging one back out restores it.
- The player can remove one card from the bag, or clear the whole bag. Clearing plays an effect where the bag is shut into a wormhole and a fresh bag replaces it.
- Cap of 10 counts open plus bagged cards. Show a clear message at the cap; do not silently drop one.

Suggested structure (adjust after the design pass):
- A `cardStore` (React context plus reducer) holding `{ id, kind, ref, x, y, z, minimized }` per card, kept out of `Character` and out of `resolve`. Window state is not character data.
- A `CardWindow` component with pointer-event dragging (no new dependency unless the design pass shows a need), keeping inside the viewport, z-order on focus.
- A `BagOfHolding` component for the minimized strip and the wormhole animation, using only transform and opacity so it stays smooth on WebKitGTK (see 0.1).
- Existing cards (species, class, background, spellbook, backpack in `BuildBoard.tsx`) render their content inside `CardWindow` rather than in fixed board spaces. Opening the same card twice focuses the existing one.
- Respect the Reduce motion setting, as `LaunchIntro` does.
- Persist the layout per session only; do not store it in the character file.

Open questions for Chris:
- Does "card" include the Browse lists on the left, or only the board spaces?
- Do cards of the same kind with different picks (two class cards) mean multiclass slots, or independent browsers?
- Should the layout survive an app restart?
- Touch and trackpad dragging on Mac and Linux: confirm both matter.

Exit: Playwright covers open 10, the cap message, minimize, restore, remove one, clear all; no layout shift in the board when cards are open; Stage 0.1 profile re-run with 10 cards open shows no regression.

---

## Budget plan: reaching about 70% of the weekly limit

I cannot see the weekly meter, and I have not measured how many tokens these stages use, so the figures below are relative sizing from file sizes and scope, not predictions. Calibrate with the real meter.

Model choice by stage:
- **Sonnet 5.5** for Stage 0.3, 0.4 investigation, and all of Stage 1. These are well-bounded edits across known files.
- **Opus 5.5** for Stage 0.1 (profiling needs judgment), Stage 2 (new data model and money math), and the Stage 3 design pass plus build.
- The Mythos-tier models are not needed for any of this.

Relative size: Stage 0 small to medium, Stage 1 medium, Stage 2 medium, Stage 3 large (roughly as large as Stages 0 to 2 combined, and the part most likely to need iteration).

Suggested run order:
1. Stage 0 on Sonnet, with 0.1 on Opus. Check the meter.
2. Stage 1 on Sonnet. Check the meter. This tells you how many percent a "medium" stage costs on your plan.
3. Stage 2 on Opus if the meter shows room. If you are already near 70% after Stage 1, stop here and wait for the reset.
4. Stage 3 after the reset, starting with the design pass only, so the expensive build begins with a plan you approved.

Rule of thumb for the stop line: after each stage, note the meter. If the next stage is the same size or larger than the one just done and the meter plus that estimate would pass 70%, wait.
