# C4 design pass: floating cards and the Bag of Holding

For Chris to read and answer before any of C4 is built (MASTER-PLAN C4; the Linux plan's Stage 3). Written
2026-10-28. Nothing here is built yet.

## What there is today

On the build board a click on a space (species, class, background, spellbook, backpack) turns its card over: the
back opens as one dialog over the board (`Back` in src/ui/BuildBoard.tsx: the kind, new pick or edit, a snapshot for
"Put it back", where it flew from). One back at a time; "Done" lands it.

## The proposal

Card backs become **floating windows**. Several can be open at once; each can be dragged, sits above or beside the
others, and can be put in the **Bag of Holding** (bottom left) and taken out again.

### State (kept out of the character and out of `resolve`)

```ts
type CardKind = "race" | "class" | "background" | "magic" | "equipment" | "browse";
interface CardWindow {
  id: string;          // one per open card
  kind: CardKind;
  ref?: string;        // the class id for a class card, the list's type for a browse card
  x: number; y: number; w: number; h: number;   // CSS pixels in the board's frame, kept inside the window
  z: number;           // stacking order: the last one touched is on top
  bagged: boolean;     // in the Bag of Holding
  snap?: Character;    // for "Put it back" on a new pick, as the single back has now
}
```

A small store (React context and a reducer: open, focus, move, resize, bag, unbag, close, clearBag) beside the
board. The character changes only through the cards' own choices, as now.

### Behaviour

- **Open:** a click on a space, or a list's card, opens its window near where it was clicked. The same card opened
  again comes to the front instead of opening twice.
- **Cap of 10**, open plus bagged. At the cap a message says so ("10 cards are out: put one in the bag away or close
  one"); nothing is dropped silently.
- **Drag** by the title bar with pointer events (mouse, trackpad and touch alike), kept inside the window; no new
  library. Resize from the bottom right corner.
- **Bag of Holding:** a button on each window puts it in the bag (the window shrinks into the bag); in the bag the
  cards show small and slightly desaturated. Dragging one out, or clicking it, brings it back where it was.
  Each bagged card has a remove; "Empty the bag" plays the wormhole (the bag is pulled into a swirl and a fresh bag
  drops in), all transform and opacity so it stays smooth on Linux.
- **Reduce motion:** no flying, shrinking or wormhole; things appear and disappear.
- **Done / Put it back** stay on species, class and background windows as now.
- The board's spaces stay where they are; windows float over them, so nothing on the board moves (no layout shift).

### Tests (the plan's exit)

Playwright: open 10, the cap message, bag, restore, remove one, empty the bag, drag keeps inside the window; the
board does not move while cards are open; the C5.6 measurement repeated with 10 cards open shows no regression.

## Questions for Chris

My suggested answer comes first in each; any other answer changes the design above.

1. **Does "card" include the lists on the left (Species, Class, Background lists), or only the board's spaces?**
   Suggested: both. A list can be torn off into its own window (the `browse` kind), so you can keep, say, the class
   list open beside the class card.
2. **Two cards of the same kind (two class cards): a multiclass, or two lists to compare?** Suggested: a class card is
   one of the character's classes (a multiclass shows one card per class); comparing options is what list windows are
   for. A second species or background card would be a list window, since a character has one of each.
3. **Should the layout (which cards are where, what is in the bag) survive restarting the app?** Suggested: yes, per
   character, kept on this computer next to the character but not inside the character file (so exports and Foundry
   files never carry it). The plan suggested per session only; say which you want.
4. **Dragging with touch and the trackpad on Mac and Linux: do both matter?** Suggested: yes; pointer events cover
   mouse, trackpad and touch in one, so it costs nothing extra to support all three.

Also worth a word: should the board's layout change at all when many cards are out (for example, the cards tile
themselves side by side on a "Tidy up" button)? Suggested: a "Tidy up" button that lines the open cards up, nothing
automatic.
