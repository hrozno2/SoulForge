/**
 * Whose content a source holds (stage D7: the release app reads no Aurora content). Aurora's element XML is the
 * default format of a source, so "not marked 5e.tools" is what makes a source Aurora's, not a mark of its own: an
 * index link the player added and a ZIP of an elements repository carry no format at all. Before 2026-11-23 the
 * move to 5e.tools and the test app's "5e.tools only" switch asked for `format !== "aurora"`, which only the test
 * cache carries, so a player's own Aurora link counted as 5e.tools content.
 *
 * - "5etools": files imported from 5e.tools (or a Plutonium export), converted on load.
 * - "homebrew": the player's own: the homebrew builder's source, content they wrote out by hand, and whatever they
 *   imported from this computer, of any size. (Until 2026-11-28 an import of more than 25 files counted as an
 *   elements repository and was not read; Chris: a user imports whatever and however many files they want.)
 * - "aurora": index links and the test cache.
 */
import type { SourceConfig } from "./sources";

export type SourceFamily = "5etools" | "homebrew" | "aurora";

/** The homebrew builder's source. */
export const HOMEBREW_BUILDER_URL = "local://builder";
/** Content the player wrote by hand on the Content tab. */
export const CUSTOM_PREFIX = "local://custom/";
type Sourced = Pick<SourceConfig, "url" | "kind" | "format">;

export function sourceFamily(s: Sourced): SourceFamily {
  if (s.format === "5etools") return "5etools";
  if (s.format === "aurora" || s.kind === "link") return "aurora";
  return "homebrew";
}

/** The sources an Aurora-free app reads: 5e.tools and the player's own homebrew. */
export const withoutAurora = <T extends Sourced>(list: readonly T[]): T[] => list.filter((s) => sourceFamily(s) !== "aurora");

/** Aurora content is on this computer (whether or not the app reads it). */
export const holdsAurora = (list: readonly Sourced[]): boolean => list.some((s) => sourceFamily(s) === "aurora");
