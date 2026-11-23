/**
 * Stage D7 (Chris 2026-11-23: "go with D7"): the release app reads no Aurora content and offers no way to add it.
 * Soul Forge Test keeps Aurora, as the comparison source for the checks; its "5e.tools only" switch loads as the
 * release does. Aurora's files already on a player's computer are left alone (never deleted by the app), and a
 * character built on them can be moved to 5e.tools.
 */
declare const __TEST_FLAVOR__: boolean;

/** The app still knows Aurora: only the test build. */
export const AURORA_IN_APP: boolean = typeof __TEST_FLAVOR__ === "boolean" && __TEST_FLAVOR__;

/** Aurora's sources are read at load: the test build, unless its "5e.tools only" switch is on. */
export const readsAurora = (settings: { fiveToolsOnly?: boolean }): boolean => AURORA_IN_APP && !settings.fiveToolsOnly;
