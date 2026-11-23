/**
 * Whose content a source holds (stage D7: the release app reads no Aurora content). Aurora's element XML is the
 * default format of a source, so "not marked 5e.tools" is what makes a source Aurora's, not a mark of its own: an
 * index link the player added and a ZIP of an elements repository carry no format at all. Before 2026-11-23 the
 * move to 5e.tools and the test app's "5e.tools only" switch asked for `format !== "aurora"`, which only the test
 * cache carries, so a player's own Aurora link counted as 5e.tools content.
 *
 * - "5etools": files imported from 5e.tools (or a Plutonium export), converted on load.
 * - "homebrew": the player's own: the homebrew builder's source and content they wrote out by hand. Small sets of
 *   files they imported from this computer count too (a friend's homebrew file).
 * - "aurora": everything else in Aurora's format: index links, the test cache, and an imported elements repository
 *   (told from a homebrew file by its size: a repository holds hundreds of files).
 */
import type { SourceConfig } from "./sources";

export type SourceFamily = "5etools" | "homebrew" | "aurora";

/** The homebrew builder's source. */
export const HOMEBREW_BUILDER_URL = "local://builder";
/** Content the player wrote by hand on the Content tab. */
export const CUSTOM_PREFIX = "local://custom/";
/** An import from this computer with more files than this is an elements repository, not somebody's homebrew. */
export const HOMEBREW_MAX_FILES = 25;

type Sourced = Pick<SourceConfig, "url" | "kind" | "format" | "fileCount">;

export function sourceFamily(s: Sourced): SourceFamily {
  if (s.format === "5etools") return "5etools";
  if (s.format === "aurora" || s.kind === "link") return "aurora";
  if (s.url === HOMEBREW_BUILDER_URL || s.url.startsWith(CUSTOM_PREFIX)) return "homebrew";
  return s.fileCount > HOMEBREW_MAX_FILES ? "aurora" : "homebrew";
}

/** The sources an Aurora-free app reads: 5e.tools and the player's own homebrew. */
export const withoutAurora = <T extends Sourced>(list: readonly T[]): T[] => list.filter((s) => sourceFamily(s) !== "aurora");

/** Aurora content is on this computer (whether or not the app reads it). */
export const holdsAurora = (list: readonly Sourced[]): boolean => list.some((s) => sourceFamily(s) === "aurora");
