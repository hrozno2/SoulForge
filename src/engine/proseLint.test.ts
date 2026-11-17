/**
 * What a feature's text promises and its rules do not give (docs/ENGINE-LEGAL-PLAN.md, W10; RULES_TIER=prose). For
 * every feature-like element of a content set: a text that says the character chooses something, gains a training,
 * learns a spell or a language, while neither the element nor the one that gives it has a rule of that kind. The
 * report, <cache>/engine/prose.md, lists them by kind and book. A starting measurement: many are choices made in
 * play ("choose one creature"), which a decided list will hold.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { AElement, ARule } from "../aurora/types";
import { stripHtml } from "../aurora/sheet";
import { loadContentSet } from "./testContent";

const C = process.env.SOULFORGE_RULES;

/**
 * Read and decided: the promise is a choice made in play, a widened list the subclass gives (Aurora's "extend"), a
 * gift a sibling element carries, or text that only describes. Each with its reason; anything else fails.
 */
const DECIDED: Record<string, string> = {
  ID_5ET_FEAT_FRHOF_GENIE_MAGIC: "Wish Magic: the spell is chosen each time it is cast (a Magic action, once per Long Rest)",
  ID_5ET_RACE_XPHB_TIEFLING_T_OTHERWORLDLY_PRESENCE: "Thaumaturgy is granted by each Fiendish Legacy (the species' sub race)",
  ID_5ET_SF_PHB_CONJURATION_SCHOOL_OF_CONJURATION_2: "describes the school, gives nothing",
  ID_5ET_SF_PHB_CONJURATION_SCHOOL_OF_CONJURATION_3: "describes the school, gives nothing",
  ID_5ET_SF_TCE_SCRIBES_ONE_WITH_THE_WORD_142: "spells chosen to vanish when the feature is used, in play",
  ID_5ET_SF_UATHEMYSTICCLASS_WU_JEN_ARCANE_DABBLER_62:
    "playtest Mystic: spells cast with psi points, not supported (docs/UA-UNSUPPORTED.md)",
  ID_5ET_RACE_EFA_KALASHTAR_T_SEVERED_FROM_DREAMS: "a skill chosen at each Long Rest, lasting until the next: in play",
  ID_5ET_SF_TCE_ARMORER_ARMOR_MODEL_31: "the armor model is changed in play (both models are on the sheet)",
  ID_5ET_SF_EFA_ARMORER_ARMOR_MODEL_3: "the armor model is changed in play (every model is on the sheet)",
  ID_5ET_SF_TCE_BEAST_BESTIAL_SOUL_62: "chosen at each rest: in play",
  ID_5ET_SF_FRHOF_NOBLE_GENIES_AURA_OF_ELEMENTAL_SHIELDING_72: "the damage type can change at the start of each turn: in play",
  ID_5ET_SF_XPHB_ARCHFEY_STEPS_OF_THE_FEY_31: "an effect chosen each time the spell is cast",
  ID_5ET_SF_PHB_DIVINATION_THE_THIRD_EYE_102: "a benefit chosen each use",
  ID_5ET_SF_PHB_TRANSMUTATION_MASTER_TRANSMUTER_142: "an effect chosen each use",
  ID_5ET_SF_TCE_WILD_MAGIC_MAGIC_AWARENESS_31: '"you know the location of any spell": a sense in play, no spell learned',
};
const FEATURE =
  /^(Racial Trait|Class Feature|Archetype Feature|Feat|Feat Feature|Background Feature|Optional Feature|Class Feature Option)$/;
/** A lasting promise, by kind, and what rule would keep it. In-play choices ("choose a creature", "choose one of the
 * following effects" when the feature is used) are left out where the wording says so. */
const PROMISES: { kind: string; re: RegExp; kept: (r: ARule) => boolean }[] = [
  {
    kind: "skill or tool training",
    re: /\b(?:gain|have|are) proficien(?:cy|t) (?:in|with) (?:one|two|three|a|an) (?:skill|tool|type|kind|of the following|artisan|musical|gaming)|proficiency in (?:one|two|three) (?:skills?|tools?|of the following)/i,
    kept: (r) => (r.kind === "select" && /Proficiency|Training Option/.test(r.type)) || (r.kind === "grant" && r.type === "Proficiency"),
  },
  {
    kind: "language",
    // Or a named one: "you learn to speak, read, and write Giant" (Giant Power, which gave nothing on 5e.tools).
    re: /\b(?:learn|speak, read, and write|know) (?:one|two|three|an?) (?:additional |extra |other )?languages?\b|\byou learn to speak, read, and write \w/i,
    kept: (r) => (r as { type?: string }).type === "Language",
  },
  {
    kind: "spell or cantrip",
    re: /\byou (?:learn|know) (?:the |one |two |a )?(?:[a-z']+ ){0,3}(?:cantrips?|spells?)\b|\bcantrip of your choice\b|\bspells? of your choice\b/i,
    // A spell set (a feat's or subclass's table of spells) is the choice of them.
    kept: (r) => /^Spell( Set)?$/.test((r as { type?: string }).type ?? ""),
  },
  { kind: "feat", re: /\bfeat of your choice\b|\bgain (?:a|an|one) [a-z ]*feat\b/i, kept: (r) => (r as { type?: string }).type === "Feat" },
  {
    kind: "a choice of options",
    re: /\b(?:choose|pick|select) (?:one|two|three) of the following\b(?! (?:effects|benefits) when)/i,
    kept: (r) => r.kind === "select",
  },
];

it.skipIf(!C || process.env.RULES_TIER !== "prose")(
  "text promises that no rule keeps",
  () => {
    const set = (process.env.RULES_CONTENT ?? "5etools") as Parameters<typeof loadContentSet>[1];
    const reg = loadContentSet(set === "srd" ? "" : C!, set);
    const all = reg.all();
    const givers = new Map<string, AElement[]>();
    for (const e of all)
      for (const r of e.rules) {
        const ids =
          r.kind === "grant" && r.id
            ? [r.id]
            : r.kind === "select"
              ? String(r.supports ?? "")
                  .split("|")
                  .filter((x) => x.startsWith("ID_"))
              : [];
        for (const id of ids) (givers.get(id) ?? givers.set(id, []).get(id)!).push(e);
      }
    const optionRules = (e: AElement) =>
      e.rules.flatMap((r) =>
        r.kind === "select"
          ? String(r.supports ?? "")
              .split("|")
              .flatMap((id) => reg.get(id)?.rules ?? [])
          : [],
      );
    const byKind = new Map<string, { n: number; books: Map<string, number>; ex: string[] }>();
    let checked = 0;
    for (const e of all) {
      if (!FEATURE.test(e.type) || (e.compendiumHidden && e.type !== "Optional Feature")) continue;
      const text = stripHtml(e.description ?? "");
      if (text.length < 30) continue;
      checked++;
      // What the element grants from Soul Forge additions (additions.ts) counts as its own.
      const added = [e, ...(givers.get(e.id) ?? [])]
        .flatMap((g) => g.rules)
        .flatMap((r) => (r.kind === "grant" && r.id.startsWith("ID_SF_ADD_") ? [reg.get(r.id)!] : []))
        .filter(Boolean);
      const rules = [
        ...e.rules,
        ...optionRules(e),
        ...added.flatMap((a) => [...a.rules, ...optionRules(a)]),
        ...(givers.get(e.id) ?? []).flatMap((g) => g.rules),
      ];
      // A subclass's expanded spell list ("the following spells are added to the warlock spell list for you").
      const widens = [e, ...(givers.get(e.id) ?? [])].some((g) => g.spellcasting?.extend);
      for (const p of PROMISES) {
        if (!p.re.test(text) || rules.some(p.kept)) continue;
        if (p.kind === "spell or cantrip" && widens) continue;
        if (DECIDED[e.id]) continue;
        const x = byKind.get(p.kind) ?? { n: 0, books: new Map<string, number>(), ex: [] as string[] };
        x.n++;
        x.books.set(e.source, (x.books.get(e.source) ?? 0) + 1);
        x.ex.push(
          `${e.name} [${e.source}] ${e.id}: "${text.slice(Math.max(0, (p.re.exec(text)?.index ?? 0) - 60), (p.re.exec(text)?.index ?? 0) + 160)}"`,
        );
        byKind.set(p.kind, x);
      }
    }
    const out = [`# Text promises no rule keeps (${set}, W10)`, "", `${checked} features with text checked.`, ""];
    for (const [k, x] of [...byKind].sort((a, b) => b[1].n - a[1].n)) {
      out.push(
        `## ${k}: ${x.n}`,
        "",
        `By book: ${[...x.books]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([b, n]) => `${b} ${n}`)
          .join("; ")}`,
        "",
        ...x.ex.map((s) => `- ${s}`),
        "",
      );
    }
    mkdirSync(join(C!, "engine"), { recursive: true });
    writeFileSync(join(C!, "engine", `prose-${set}.md`), out.join("\n"));
    console.log(`PROSE ${set}: ${checked} checked; ${[...byKind].map(([k, x]) => `${k} ${x.n}`).join(", ")}`);
    // The gate: nothing a text promises is left without a rule or a decision (W10).
    expect([...byKind.values()].flatMap((x) => x.ex)).toEqual([]);
  },
  1800000,
);
