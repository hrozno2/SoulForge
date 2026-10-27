# Unearthed Arcana: what Soul Forge does not support yet

Playtest (Unearthed Arcana) content is in scope (Chris, 2026-10-26; it was out of scope by the audit decision of
2026-10-17). Support is planned as master plan A4: after the other engine fixes, before the test stage. Until then,
every piece of playtest content the engine does not handle is listed here, so nothing is forgotten. When an item is
supported, strike it and note the commit.

How to add to this list: anything playtest-only that a check reports (an unread statistic, a choice with no options,
a rules-check finding on a playtest element, an unmatched 5e.tools or Foundry entry) goes here with where it was
seen, instead of being fixed by hand or hidden.

| # | Item | Source | What is missing | Seen by |
|---|---|---|---|---|
| ~~UA1~~ | ~~`infusions:count`~~ | ~~Artificer, Unearthed Arcana 2019-02-28: Infuse Item~~ | Done 2026-10-27: the infusions known; the content's own Artificer Infusion choices give that many per level, and the sheet shows the infused-item maximum (`infusions:items`). | stat gate |
| UA2 | `infusions:vanish` | Same feature | 1 + Intelligence modifier; nothing in the content's text says what it counts, so it is not shown. Needs the playtest article (2019-02-28) to place. Does not stop the class being played. | stat gate |
| ~~UA3~~ | ~~`equipment:id_wotc_ua_armor_light_arcanomechanical`~~ | ~~Wizard School of Invention, Unearthed Arcana 2018-01-08~~ | Done 2026-10-27: "equipment:<item>" means the feature gives the item; it goes into the inventory once (src/aurora/grantedItems.ts, for any content that uses it). | stat gate |
| ~~UA4~~ | ~~Artificer (2017 playtest) proficiencies~~ | ~~Unearthed Arcana: Artificer (2017-01-09)~~ | Withdrawn 2026-10-27: not a disagreement. 5e.tools has no 2017 Artificer; the gate had compared Aurora's playtest class with 5e.tools' Tasha's Artificer because the names match. The gate now pairs classes by book. | class proficiency gate |

The stat dictionary (src/engine/statDictionary.ts) marks UA1 to UA3 as "playtest, not supported yet" so the gate
stays meaningful; remove that entry when they are wired.

In the app, a feature listed in src/aurora/comingSoon.ts and whatever grants it show with a "Coming soon" mark and
cannot be picked; random characters and autofill skip them. Since 2026-10-27 the list is empty: the 2019 playtest
Artificer and the 2018 School of Invention can be picked. Add a feature there when something listed here stops a class
or option being played.

## The playtest audit (A4)

`SOULFORGE_RULES=$HOME/.soulforge-test RULES_TIER=ua npx vitest run src/engine/uaAudit.test.ts` builds every playtest
class, subclass, species, subrace, background and feat and checks it as official content is
(<cache>/engine/ua.md). 2026-10-27: 254 built, 239 with nothing found (94%). The 15 left are feats whose prerequisite is
a chain of other feats (Squire of Solamnia before the Knight feats, Scion of the Outer Planes before Agent of Order),
which the audit's character does not take: a limit of the audit, not of the engine.
