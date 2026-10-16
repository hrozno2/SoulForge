/** Small line icons in the spirit of a tabletop game: drawn here, no outside art. They take their colour from the text around them. */
import type { ReactNode } from "react";

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

const wrap = (children: ReactNode, size = 16, className = "ico") => (
  <svg {...base} width={size} height={size} className={className}>{children}</svg>
);

/** A drawstring bag with a die on it, for the dice roller. */
export const DiceBag = ({ size = 22 }: { size?: number }) =>
  wrap(
    <>
      <path d="M9 7.5 7.5 3.5h9L15 7.5" />
      <path d="M9 7.5c-3.500 2.500-5 6.500-4 10 .6 2.200 3.300 3.500 7 3.500s6.400-1.300 7-3.500c1-3.500-.5-7.500-4-10" />
      <path d="M9 7.500c2 1.200 4 1.200 6 0" />
      <path d="M12 8.500v1.800M10.500 10.600 12 12l1.500-1.400" />
      <path d="M12 13.300l3 1.700v3.200l-3 1.700-3-1.700V15z" />
      <path d="M9 15l3 1.700L15 15M12 16.700v3.200" />
    </>,
    size,
    "ico dice-bag",
  );

export const D20 = ({ size = 16 }: { size?: number }) => wrap(<><path d="M12 2.500l8.500 4.800v9.400L12 21.500l-8.500-4.800V7.300z" /><path d="M12 8l4.500 8h-9z" /><path d="M12 2.500V8M3.500 7.300 7.500 16M20.500 7.300 16.500 16M7.500 16l-4 .7M16.500 16l4 .7M12 21.500V16" /></>, size);
export const Tower = ({ size = 16 }: { size?: number }) => wrap(<><path d="M5 21V9l2-2V4h2v2h2V4h2v2h2V4h2v3l2 2v12z" /><path d="M10 21v-5a2 2 0 0 1 4 0v5" /></>, size);
export const Anvil = ({ size = 16 }: { size?: number }) => wrap(<><path d="M3 7.500h12c0 2.500-2 4-4.500 4.500v2.500h3.500v3.500H6.500v-3.500H10v-2.500C6 11.500 3 10 3 7.500z" /><path d="M15 8h4l2-1.500" /></>, size);
export const Wand = ({ size = 16 }: { size?: number }) => wrap(<><path d="M4 20 14 10" /><path d="M16.500 3l.9 2.100 2.100.9-2.100.9-.9 2.100-.9-2.100-2.100-.9 2.100-.9z" /><path d="M6 6l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5zM19 14l.4.8.8.4-.8.4-.4.8-.4-.8-.8-.4.8-.4z" /></>, size);
export const Sword = ({ size = 16 }: { size?: number }) => wrap(<><path d="M20 4l-9.500 9.500" /><path d="M20 4h-4.500L11 8.500" /><path d="M20 4v4.500L15.500 13" /><path d="M8 11l5 5" /><path d="M6.500 17.500 4 20" /><path d="M5 14.500l4.500 4.500" /></>, size);
export const Scroll = ({ size = 16 }: { size?: number }) => wrap(<><path d="M8 4h11a1.500 1.500 0 0 1 1.500 1.500V16H10v2.500a2 2 0 0 1-4 0V6a2 2 0 0 1 2-2z" /><path d="M10 16v2a2 2 0 0 0 2 2h6a2.500 2.500 0 0 0 2.500-2.500V16" /><path d="M11 8h6M11 11.500h6" /></>, size);
export const Tome = ({ size = 16 }: { size?: number }) => wrap(<><path d="M5 4.500A1.500 1.500 0 0 1 6.500 3H18v15H6.500A1.500 1.500 0 0 0 5 19.500z" /><path d="M5 19.500A1.500 1.500 0 0 0 6.500 21H18v-3" /><path d="M9 7.500h5M9 10.500h4" /></>, size);
export const Page = ({ size = 16 }: { size?: number }) => wrap(<><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 12h7M9 15.500h7M9 8.500h3" /></>, size);

export const Head = ({ size = 16 }: { size?: number }) => wrap(<><circle cx="12" cy="8" r="4" /><path d="M4.500 20.500c.8-4.200 3.700-6.500 7.500-6.500s6.700 2.300 7.500 6.500" /></>, size);
export const Speech = ({ size = 16 }: { size?: number }) => wrap(<><path d="M4 5h16v10H10l-4 4v-4H4z" /><path d="M8 9h8M8 12h5" /></>, size);
export const Star = ({ size = 16 }: { size?: number }) => wrap(<path d="M12 3.500l2.500 5.200 5.700.8-4.100 4 1 5.700L12 16.500l-5.100 2.700 1-5.700-4.100-4 5.700-.8z" />, size);
export const Pack = ({ size = 16 }: { size?: number }) => wrap(<><path d="M6 9a6 4 0 0 1 12 0v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M9 5.500V4h6v1.500M9 13h6v4H9z" /></>, size);
export const Shield = ({ size = 16 }: { size?: number }) => wrap(<path d="M12 3l7 3v5c0 4.500-3 8-7 10-4-2-7-5.500-7-10V6z" />, size);
/**
 * A symbol for each kind of species, drawn here in the same line style (no outside art): a crown for humans, a leaf
 * for elves, an axe for dwarves, and so on. Anything not listed gets a compass star.
 */
const SPECIES_SYMBOLS: [RegExp, ReactNode][] = [
  [/tiefling/, <><path d="M7 21c-3-4-3-9 0-13M17 21c3-4 3-9 0-13" /><path d="M7 8C5 6 4 3 6 2c1 2 2 3 4 4M17 8c2-2 3-5 1-6-1 2-2 3-4 4" /></>],
  [/dragonborn|draconic|dragon/, <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 1 3 3 4 0-3-1-5 0-8z" />],
  [/aasimar/, <><ellipse cx="12" cy="5" rx="5" ry="1.800" /><path d="M12 9v12M12 12c-3-3-7-3-9-1 2 1 4 4 9 3M12 12c3-3 7-3 9-1-2 1-4 4-9 3" /></>],
  [/half-?orc|\borc|goblin|hobgoblin|bugbear/, <><path d="M5 9c0 6 3 11 7 11s7-5 7-11" /><path d="M8 13l1-5M16 13l-1-5M9 16h6" /></>],
  [/goliath|giant/, <path d="M2.500 20 9 7l3.500 6 2.500-4 6.500 11z" />],
  [/dwarf|duergar/, <><path d="M6 21 17 7" /><path d="M14 4c3 0 6 2 7 5-3 0-5 1-6 3l-4-4c1-2 2-3 3-4z" /></>],
  [/halfling/, <><path d="M6 10h12c0 6-3 10-6 10s-6-4-6-10z" /><path d="M5 10c0-3 3-5 7-5s7 2 7 5M12 5V3" /></>],
  [/gnome/, <><circle cx="12" cy="12" r="3.500" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100" /></>],
  [/elf|eladrin|drow|shadar|sea elf|firbolg/, <><path d="M5 19C5 10 11 4 19 4c0 8-6 15-14 15z" /><path d="M5 19 15 9" /></>],
  [/tabaxi|cat|leonin|catfolk/, <><circle cx="12" cy="15" r="3.500" /><circle cx="6.500" cy="10" r="1.800" /><circle cx="17.500" cy="10" r="1.800" /><circle cx="9.500" cy="6" r="1.800" /><circle cx="14.500" cy="6" r="1.800" /></>],
  [/kenku|aarakocra|owlin|bird|raven/, <><path d="M19 3C10 4 6 10 5 19" /><path d="M19 3c-1 5-4 9-9 11M14 6l-4 1M16 9l-5 2" /></>],
  [/tortle|turtle/, <><path d="M12 4 18.500 8v8L12 20 5.500 16V8z" /><path d="M12 9l3 2v3l-3 2-3-2v-3z" /></>],
  [/genasi/, <path d="M12 3c5 0 8 3 8 7 0 3-2 5-5 5-2 0-3-1-3-3 0-1 1-2 2-2M12 21c-5 0-8-3-8-7 0-3 2-5 5-5 2 0 3 1 3 3 0 1-1 2-2 2" />],
  [/human/, <><path d="M4 17h16M4 17 5 8l4 4 3-6 3 6 4-4 1 9" /><path d="M5 20h14" /></>],
];
const STAR = <path d="M12 2.500l2 7.500 7.500 2-7.500 2-2 7.500-2-7.500L2.500 12l7.500-2z" />;

/** The symbol of a species, by its name. */
export const SpeciesIcon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const n = name.toLowerCase();
  return wrap(SPECIES_SYMBOLS.find(([re]) => re.test(n))?.[1] ?? STAR, size);
};
export const TAB_ICONS: Record<string, (p: { size?: number }) => ReactNode> = {
  start: Tower, build: Anvil, magic: Wand, equipment: Sword, manage: Scroll, play: D20, sheet: Page, content: Tome,
};
