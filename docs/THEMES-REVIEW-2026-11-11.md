# Themes and colours: review, 2026-11-11

Chris asked (2026-11-10): "consider all the color options in the menus. Some of the backgrounds and menu colors are
maybe a bit too much. Recommend changes." Every theme was drawn on Home, Build, an open list, Play and the menu at
1440 by 900 with the bundled SRD rules. Small copies are in docs/screenshots/themes (`<theme>-1-home`, `-2-build`,
`-4-play`). Nothing about the themes themselves is changed by this review; what was changed is listed at the end.

## What makes the screens loud

The six themes differ in the page (background, panels, lines, the accent). What is "too much" is the same in all six,
because it does not come from the theme:

1. **The five cards on Build each carry their own strong colour**, whatever the theme: species olive green, class by
   class (blue, purple, green, red...), background violet, spellbook purple, backpack orange. The card gradient is
   `hsl(hue 60% 42%)` at its brightest corner. Next to each other, with gold frames, a red hit point bar, a gold hit
   dice bar and amber score chips, there are seven or eight strong colours on one screen.
2. **The Play header is a full-width crimson field** in every theme (light themes included), with the level medal,
   gold portrait ring and green hit point bar on top of it.
3. **Light themes keep the dark cards.** On Daylight and Printed book the page is light and the cards and the Play
   header stay dark and saturated, so the contrast between page and card is at its highest exactly where the theme
   is meant to be calm. The round "i" and "×" buttons on those cards are dark on dark and nearly invisible.
4. **The accent is used for three different things**: the active tab, the primary button and the "selected" state
   (Standard array on Daylight is solid red, the same red as the danger colour).

## Recommendations (for Chris to decide)

| # | Change | Why | Size |
|---|---|---|---|
| T1 | Lower the cards' colour strength by about a half (60% to 30% saturation) and keep the class hue only on the class card; species, background, spellbook and backpack take one neutral tone from the theme. | One colour tells you the class; five compete. | Small (two CSS rules). Try it now: Settings, "Calmer colours". |
| T2 | The Play header takes the theme's panel colour with a thin accent line, not a crimson field. Keep crimson for Obsidian and Printed book, where it is the theme. | Play is the screen looked at longest. | Small. |
| T3 | Light themes get light cards: the class hue as a tint on the paper colour (about 12% strength), dark text. | A light theme with dark cards is two themes at once. | Medium (card text colours are written for dark). |
| T4 | One meaning per colour: accent for "where you are" and the primary action; a separate, quieter "selected" fill (the panel colour with an accent outline); red only for hit points and warnings. A `--danger` colour is not defined in any theme today (the code falls back to a fixed red). | Standard array, the active tab and a warning should not look alike. | Small. |
| T5 | Six themes to four: Slate and amber (default), Obsidian, Printed book, Daylight. Leather is Obsidian with gold instead of red; Tools blue is Slate with blue instead of amber. | Fewer, more different choices. | Small, but people may have chosen them: keep their setting working by mapping the two onto their neighbours. |
| T6 | The theme picker shows a swatch (page, panel, accent) beside each name instead of a plain list. | The names do not say what you get. | Small. |

## Faults found while looking (fixed)

- **Dice read as "ID4+2"** in the four themes with the serif display face: its "1" is a capital I and its small
  capitals turn "d" into "D". Dice and bonuses on roll buttons now use the plain face.
- **The character's name was cut off** in the Build panel ("RANDOM ADVENTU"): it now ends in an ellipsis.
- **"Feat: Xphb Magic Initiate Cleric"** on a background's card: the feat's name was read off its id. It is the
  feat's own name now ("Magic Initiate (Cleric)").
- **A Monk 9 had 1 ki point; "Spellcasting" showed as one use a day; a level-9 Dragonborn's breath showed 2d6.**
  Rules faults, fixed in the engine (docs/AUDIT-2026-11-10.md, R14 to R16).
- **Home showed a new character only after its next four-second refresh.** It re-reads the library when a save lands.
- **The landing animation played at the pick**, before the card was slotted in. It plays on Apply now.

## Seen, not changed (for Chris)

- Build's heading "Ready, set, Start your story..." stays on a finished level 9 character.
- The Dice button (bottom right, fixed) covers the last row of the scores panel at 900 px height.
- Daylight's top bar is dark navy with a red line while everything under it is light grey.

## Open: light themes (Chris, 2026-11-13)

In the light themes things do not look good yet: some icons become unreadable (light on light), and the cards stay
dark. Marked for a later pass, not started. Where to look: icons drawn with fixed colours instead of the theme's ink
tokens (`src/ui/icons.tsx`, `classIcons.tsx`, `schoolIcons.tsx`, `conditionIcons.tsx`), and the card and floating
window backgrounds in `src/ui/styles.css` (`.card-back-body`, `.card-window`, `.float-window`, `.mini-card`), which
set their own dark colours rather than reading the theme's paper tokens. Check every light theme with the headless
screenshot method of 2026-11-11, card by card.
