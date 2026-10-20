/**
 * The canonical content model (docs/ENGINE-PLAN.md, 3.1-3.3). Every content source loads into this shape; the
 * resolver reads nothing else. References between elements are canonical keys, never source ids.
 */

export type Edition = "2014" | "2024";
export type Origin = "aurora" | "5etools";

export interface SourceRef {
  /** The source's own id (an Aurora or 5e.tools element id). */
  id: string;
  book: string;
  origin: Origin;
}

/** Something that changes a character. A requirement ("when") is kept as the source's expression for now. */
export type Effect =
  /** A shared concept the character now has: a proficiency, expertise, language, sense or size (concepts.ts). */
  | { kind: "concept"; key: string; level?: number; when?: string }
  /** Another element (a feature, a feat, a spell, a subrace) the character now has. */
  | { kind: "grant"; element: string; elementType: string; level?: number; when?: string; spellcasting?: string; prepared?: boolean }
  /** A named number. `bonus` is the stacking group (only the highest of a group counts). */
  | { kind: "stat"; name: string; value: string; bonus?: string; level?: number; when?: string; equipped?: string };

export interface Choice {
  /** Stable: the owner's key plus a fingerprint of the choice, never its position (docs/ENGINE-PLAN.md, 1.6). */
  key: string;
  /** The key the old engine used ("ownerId|index"), for migrating saved characters. */
  legacyKey: string;
  type: string;
  name: string;
  /** The filter over elements, as the source wrote it; canonical keys where it names elements. */
  filter: string;
  count: number;
  level?: number;
  optional: boolean;
  default?: string;
  when?: string;
  spellcasting?: string;
  /** Plain-text options (personality traits and similar). */
  items?: { id: string; text: string }[];
}

export interface IRElement {
  key: string;
  type: string;
  name: string;
  edition: Edition;
  /** Every source this element was loaded from; the first is the primary, which provides the mechanics. */
  sources: SourceRef[];
  /** The shared concept this element stands for, when it is one (concepts.ts). */
  concept?: string;
  effects: Effect[];
  choices: Choice[];
  requires?: string;
  supports: string[];
  hidden: boolean;
}

export interface LoadReport {
  elements: number;
  bySource: Record<Origin, number>;
  /** Source elements merged into another (same concept). */
  merged: number;
  /** Concepts both sources provide (they now share one key). */
  sharedConcepts: string[];
  /** Concept-like elements (proficiencies, languages, senses) whose concept could not be read from the name. */
  unmappedConcepts: { id: string; name: string; type: string }[];
  /** References to elements that do not exist in any source. */
  danglingRefs: { owner: string; ref: string; kind: string }[];
  /** Choices whose fingerprint repeats inside one element (they get an occurrence number in the key). */
  repeatedChoices: number;
}

export interface Content {
  elements: Map<string, IRElement>;
  /** Source id -> canonical key. */
  keyOf: Map<string, string>;
  report: LoadReport;
}
