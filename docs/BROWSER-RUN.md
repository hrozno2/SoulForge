# The browser run (on request)

A look at many random characters the way a player sees them: every board space's card back, screenshotted and
checked. It runs only when asked (C5.5); the normal `npx playwright test` skips it.

## Run it

```bash
BROWSER_RUN=20 npx playwright test e2e/browserRun.spec.ts --reporter=line
```

`BROWSER_RUN` is the number of characters. Each one is a random character at a level from 1 to 20 (spread, not
random), built from the test content (the same small ruleset as every interface test, served from `fixtures/`).

## What it does

For each character it opens the Build board and, in turn, every space that has a card back (species, class,
background, spells, equipment). Each back is screenshotted to `test-results/browser-run/<n>-<space>.png`, and its text is
checked for `undefined`, `NaN` or a lone `?` where a name belongs. After the spaces it reads the rules check's verdict
on the board.

It fails on a page error or on odd text in any back. The rules check's verdicts are listed in the output
(`BROWSERRUN` lines), not failed on: a random character can break a rule the check is right to report.

## Reading the result

- Look through the screenshots for anything that looks wrong: an empty card, a cut-off list, a choice that repeats a
  pick (the first run of this found the test Spellsinger learning the same spell in several choices: the test content
  had too few spells, and the rules check now flags a spell learned twice).
- A verdict other than "Follows the rules" names the problem on the board; open that character in the preview to see it.
- Note what you found in docs/RESUME.md, and fix the cause for every character, not the one screenshot.

## With the full content

The run uses the test content so it works anywhere. To look at the full Aurora and 5e.tools content instead, open the
preview (`soulforge-test` in .claude/launch.json), click "Load test content" on the test bar, then "Make 10 random
characters", and go through them on Home and Build by hand or with the browser tools.
