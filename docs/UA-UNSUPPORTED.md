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
| UA1 | `infusions:count` | Artificer, Unearthed Arcana 2019-02-28: Infuse Item (`ID_WOTC_UA20190228_CLASS_FEATURE_ARTIFICER_INFUSE_ITEM`) | The number of infusions, set at several levels; not shown or used. | stat gate |
| UA2 | `infusions:vanish` | Same feature | Probably how many infused items there may be before the oldest stops working (from its name; to confirm in the content); not shown or used. | stat gate |
| UA3 | `equipment:id_wotc_ua_armor_light_arcanomechanical` | Wizard School of Invention, Unearthed Arcana 2018-01-08 (Three Subclasses): Arcanomechanical Armor (`ID_WOTC_UA_ARCHETYPE_FEATURE_SCHOOL_INVENTION_ARCANOMECHANICAL_ARMOR`) | A value tied to the arcanomechanical armor item; not applied. | stat gate |

The stat dictionary (src/engine/statDictionary.ts) marks UA1 to UA3 as "playtest, not supported yet" so the gate
stays meaningful; remove that entry when they are wired.

In the app, the features above and whatever grants them (today the 2019 playtest Artificer class and the 2018 School
of Invention) show with a "Coming soon" mark and cannot be picked; random characters and autofill skip them. The ids
live in src/aurora/comingSoon.ts: add an item's feature there when it is listed here, remove it when it is supported.
