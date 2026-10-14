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

export const Head = ({ size = 16 }: { size?: number }) => wrap(<><circle cx="12" cy="8.500" r="4" /><path d="M4.500 20.500c.8-4 3.800-6 7.500-6s6.700 2 7.500 6" /><path d="M8.500 6.500 7 3.500l3 1.700M15.500 6.500 17 3.500l-3 1.700" /></>, size);
export const Speech = ({ size = 16 }: { size?: number }) => wrap(<><path d="M4 5h16v10H10l-4 4v-4H4z" /><path d="M8 9h8M8 12h5" /></>, size);
export const Star = ({ size = 16 }: { size?: number }) => wrap(<path d="M12 3.500l2.500 5.200 5.700.8-4.100 4 1 5.700L12 16.500l-5.100 2.700 1-5.700-4.100-4 5.700-.8z" />, size);
export const Pack = ({ size = 16 }: { size?: number }) => wrap(<><path d="M6 9a6 4 0 0 1 12 0v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M9 5.500V4h6v1.500M9 13h6v4H9z" /></>, size);
export const TAB_ICONS: Record<string, (p: { size?: number }) => ReactNode> = {
  start: Tower, build: Anvil, magic: Wand, equipment: Sword, manage: Scroll, play: D20, sheet: Page, content: Tome,
};
