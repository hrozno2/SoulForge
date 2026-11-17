/**
 * Soul Forge additions: rules 5e.tools' text states and its data does not (docs/ENGINE-LEGAL-PLAN.md, W10). Each is a
 * small element of the source "Soul Forge additions", given by the feature whose text promises it, so the sheet, the
 * books list and the rules check all say where it came from. Found by the prose lint (RULES_TIER=prose,
 * proseLint.test.ts), each read against its book; Chris, 2026-11-17: "If there is text content 5e tools has in text
 * but lacks underlying features then build that out. Mark it as soulforge additions in sources."
 *
 * Only 5e.tools ids are touched; an addition whose target is not loaded does nothing.
 */
import type { AElement, ARule } from "./types";

export const ADDITIONS_SOURCE = "Soul Forge additions";
export const ADDITIONS_SOURCE_ID = "ID_SF_SOURCE_ADDITIONS";

type Opt = { key: string; name: string; text: string; rules: ARule[] };
interface Addition {
  /** The element whose text promises it. */
  target: string;
  /** The book's sentence, in short, and what 5e.tools' data gives instead. */
  why: string;
  /** Rules the target gains (through an element of its own). */
  add?: ARule[];
  /** One choice among options, taking the target's own rules that `take` selects into the options. */
  choose?: { name: string; options: Opt[]; take: (r: ARule) => boolean };
  /** Requirements to add to another element's rule (the parent race's own Skill Versatility). */
  gate?: { id: string; rule: (r: ARule) => boolean; not: string };
  /** A creature the feature calls, which no bestiary has: given to the character as its companion. */
  creature?: { name: string; setters: Record<string, string> };
}

const sel = (type: string, name: string, supports: string, number = 1): ARule => ({ kind: "select", type, name, supports, number });
const skills = (...names: string[]) => names.map((n) => `ID_5ET_SKILL_${n.toUpperCase().replace(/ /g, "_")}`).join("|");
const isSkills = (r: ARule) => r.kind === "select" && r.type === "Proficiency" && /\bskill$/.test(r.name);
const isWeapon = (r: ARule) => r.kind === "grant" && /^ID_5ET_PROF_WEAPON_ALL_(LONGSWORD|SHORTSWORD|SHORTBOW|LONGBOW)$/.test(r.id);
const isSpell = (r: ARule) => (r.kind === "grant" || r.kind === "select") && r.type === "Spell";
const HALF_ELF = "ID_5ET_RACE_PHB_HALF_ELF";
const VARIANT = "ID_5ET_SUBRACE_SCAG_HALF_ELF_VARIANT_";
const SKILL_VERSATILITY: Opt = {
  key: "SKILLS",
  name: "Skill Versatility",
  text: "You gain proficiency in two skills of your choice.",
  rules: [sel("Proficiency", "Skill Versatility skill", "5et skill", 2)],
};
const WEAPONS: Opt = {
  key: "WEAPONS",
  name: "Elf Weapon Training",
  text: "You have proficiency with the longsword, shortsword, shortbow, and longbow.",
  rules: ["LONGSWORD", "SHORTSWORD", "SHORTBOW", "LONGBOW"].map(
    (w) => ({ kind: "grant", type: "Proficiency", id: `ID_5ET_PROF_WEAPON_ALL_${w}` }) as ARule,
  ),
};
const halfElf = (descent: string, others: Opt[]): Addition => ({
  target: `${VARIANT}${descent}`,
  why: "Sword Coast Adventurer's Guide, Half-Elf Variants: a half-elf of this descent takes one of these in place of Skill Versatility. 5e.tools' data gave the skills and every variant feature together (or, for the Aquatic descent, the skills only and no swimming speed).",
  choose: {
    name: "Variant feature (choose 1)",
    options: [SKILL_VERSATILITY, ...others],
    take: (r) => isSkills(r) || isWeapon(r) || isSpell(r),
  },
  gate: { id: HALF_ELF, rule: (r) => r.kind === "select" && r.name === "Half-Elf skill", not: `${VARIANT}${descent}` },
});

const ADDITIONS: Addition[] = [
  {
    target: "ID_5ET_SF_EGW_ECHO_KNIGHT_MANIFEST_ECHO_31",
    why: "Explorer's Guide to Wildemount, Echo Knight, Manifest Echo: the echo's numbers are in the feature's text (AC 14 + your proficiency bonus, 1 hit point, immunity to all conditions, your saving throws); no bestiary has it as a creature, so Play had no card for it.",
    creature: {
      name: "Echo",
      setters: {
        size: "Same as you",
        type: "Echo (a translucent gray image of you)",
        ac: "14 + PB",
        hp: "1",
        speed: "30 ft. (moved on your command, no action; destroyed if more than 30 feet from you at the end of your turn)",
        senses: "",
        languages: "",
        challenge: "",
        traits:
          "<p><b>Immunities.</b> All conditions.</p><p><b>Saving Throws.</b> It uses your saving throw bonus for any saving throw it makes.</p><p><b>Lasts.</b> Until it is destroyed (any damage), until you dismiss it as a bonus action, until you manifest another echo, or until you are Incapacitated.</p>",
        actions:
          "<p><b>Swap.</b> As a bonus action, you teleport, swapping places with your echo, at a cost of 15 feet of your movement.</p><p><b>Attack from the Echo.</b> When you take the Attack action, any attack you make with it can originate from your space or the echo's.</p><p><b>Opportunity Attack.</b> When a creature you can see within 5 feet of your echo moves at least 5 feet away from it, you can use your reaction to make an opportunity attack against it as if you were in the echo's space.</p>",
      },
    },
  },
  halfElf("AQUATIC_ELF_DESCENT", [
    {
      key: "SWIM",
      name: "Swim",
      text: "You gain a swimming speed of 30 feet.",
      rules: [{ kind: "stat", name: "innate speed:swim", value: "30", bonus: "base" }],
    },
  ]),
  halfElf("DROW_DESCENT", [
    {
      key: "DROW_MAGIC",
      name: "Drow Magic",
      text: "You know the Dancing Lights cantrip; at 3rd level you can cast Faerie Fire and at 5th level Darkness, each once per long rest. Charisma is your spellcasting ability for these spells.",
      rules: [], // the descent's own spell grants, taken from it
    },
  ]),
  halfElf("MOON_ELF_OR_SUN_ELF_DESCENT", [
    WEAPONS,
    {
      key: "CANTRIP",
      name: "Cantrip",
      text: "You know one cantrip of your choice from the wizard spell list. Intelligence is your spellcasting ability for it.",
      rules: [],
    },
  ]),
  halfElf("WOOD_ELF_DESCENT", [
    WEAPONS,
    {
      key: "FLEET",
      name: "Fleet of Foot",
      text: "Your base walking speed increases to 35 feet.",
      rules: [{ kind: "stat", name: "innate speed", value: "35", bonus: "base" }],
    },
    {
      key: "MASK",
      name: "Mask of the Wild",
      text: "You can attempt to hide even when you are only lightly obscured by foliage, heavy rain, falling snow, mist, and other natural phenomena.",
      rules: [],
    },
  ]),
  ...["DHAMPIR", "REBORN"].map((race): Addition => ({
    target: `ID_5ET_RACE_VRGR_${race}_T_ANCESTRAL_LEGACY`,
    why: "Van Richten's Guide to Ravenloft, Ancestral Legacy: a lineage chosen at character creation gives proficiency in two skills of your choice. 5e.tools' data gave none (the Hexblood's does).",
    add: [sel("Proficiency", "Ancestral Legacy skill", "5et skill", 2)],
  })),
  {
    target: "ID_5ET_RACE_EFA_KHORAVAR_T_SKILL_VERSATILITY",
    why: "Eberron: Forge of the Artificer, Khoravar, Skill Versatility: proficiency in one skill or with one tool of your choice (which a Long Rest can change). 5e.tools' data gave none.",
    add: [sel("Proficiency", "Skill Versatility skill or tool", "5et skill|5et tool")],
  },
  {
    target: "ID_5ET_CF_TCE_EXPERT_SIDEKICK_SHARP_MIND_18",
    why: "Tasha's Cauldron of Everything, Expert sidekick, Sharp Mind: proficiency in one of Intelligence, Wisdom or Charisma saving throws, of your choice. 5e.tools' data gave none.",
    add: [sel("Proficiency", "Sharp Mind saving throw", "ID_5ET_SAVE_INTELLIGENCE|ID_5ET_SAVE_WISDOM|ID_5ET_SAVE_CHARISMA")],
  },
  {
    target: "ID_5ET_SUBRACE_PSK_ELF_KALADESH_VAHADAR_T_EXTRA_LANGUAGE",
    why: "Plane Shift: Kaladesh, Vahadar elf, Extra Language: one extra language of your choosing. 5e.tools' data gave none.",
    add: [sel("Language", "Extra Language", "5et language")],
  },
  {
    target: "ID_5ET_SUBRACE_MTF_GITH_GITHYANKI_T_DECADENT_MASTERY",
    why: "Mordenkainen's Tome of Foes, Githyanki, Decadent Mastery: one language of your choice (and a skill or tool, which 5e.tools' data does give). The language was missing.",
    add: [sel("Language", "Decadent Mastery language", "5et language")],
  },
  {
    target: "ID_5ET_SF_PHB_KNOWLEDGE_PSA_BLESSINGS_OF_KNOWLEDGE_11",
    why: "Plane Shift: Amonkhet, Knowledge Domain, Blessings of Knowledge: you learn two languages of your choice. 5e.tools' data gave the skills and expertise only.",
    add: [sel("Language", "Blessings of Knowledge language", "5et language", 2)],
  },
  {
    target: "ID_5ET_SF_FRHOF_BANNERET_KNIGHTLY_ENVOY_3",
    why: "Forgotten Realms: Heroes of Faerûn, Banneret, Knightly Envoy, Polyglot: you learn one language (a Long Rest can swap it). 5e.tools' data gave none.",
    add: [sel("Language", "Polyglot language", "5et language")],
  },
  ...[
    ["CAVALIER", "Animal Handling, History, Insight, Performance, Persuasion"],
    ["SAMURAI", "History, Insight, Performance, Persuasion"],
  ].map(([sub]): Addition => ({
    target: `ID_5ET_SF_XGE_${sub}_BONUS_PROFICIENCY_31`,
    why: "Xanathar's Guide to Everything, Bonus Proficiency: one of the listed skills or, alternatively, one language of your choice. 5e.tools' data offered the skill only.",
    choose: {
      name: "Bonus Proficiency: a skill or a language",
      options: [
        { key: "SKILL", name: "A skill", text: "Proficiency in one of the listed skills.", rules: [] },
        {
          key: "LANGUAGE",
          name: "A language",
          text: "One language of your choice.",
          rules: [sel("Language", "Bonus Proficiency language", "5et language")],
        },
      ],
      take: (r) => r.kind === "select" && r.type === "Proficiency",
    },
  })),
  {
    target: "ID_5ET_SF_UATHEMYSTICCLASS_AWAKENED_AWAKENED_TALENT_11",
    why: "Unearthed Arcana: The Mystic Class, Order of the Awakened, Awakened Talent: two of the listed skills. 5e.tools' data gave none.",
    add: [
      sel(
        "Proficiency",
        "Awakened Talent skill",
        skills("Animal Handling", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Persuasion"),
        2,
      ),
    ],
  },
  {
    target: "ID_5ET_SF_UATHEMYSTICCLASS_WU_JEN_HERMIT_S_STUDY_11",
    why: "Unearthed Arcana: The Mystic Class, Order of the Wu Jen, Hermit's Study: two of the listed skills. 5e.tools' data gave none.",
    add: [
      sel(
        "Proficiency",
        "Hermit's Study skill",
        skills("Animal Handling", "Arcana", "History", "Insight", "Medicine", "Nature", "Perception", "Religion", "Survival"),
        2,
      ),
    ],
  },
];

/** Applies every addition whose target is loaded; returns how many. */
export function soulForgeAdditions(byId: Map<string, AElement>): number {
  let n = 0;
  for (const a of ADDITIONS) {
    const t = byId.get(a.target);
    if (!t) continue;
    const base = `ID_SF_ADD_${a.target.replace(/^ID_5ET_/, "")}`;
    if (byId.has(base)) continue;
    const make = (id: string, name: string, text: string, rules: ARule[], extra: Partial<AElement> = {}): AElement => {
      const el: AElement = {
        id,
        name,
        type: t.type === "Sub Race" || t.type === "Race" ? "Racial Trait" : t.type,
        source: ADDITIONS_SOURCE,
        supports: [],
        description: `<p>${text}</p><p><em>${ADDITIONS_SOURCE}: ${a.why}</em></p>`,
        compendiumHidden: true,
        setters: {},
        rules,
        edition: t.edition,
        origin: "soulforge",
        ...extra,
      };
      byId.set(id, el);
      return el;
    };
    const rules: ARule[] = [...(a.add ?? [])];
    if (a.creature) {
      const id = `ID_SF_ADD_CREATURE_${a.creature.name.toUpperCase().replace(/\W+/g, "_")}`;
      make(id, a.creature.name, `${t.name}: the creature it calls.`, [], {
        type: "Companion",
        supports: ["5et creature"],
        setters: Object.fromEntries(Object.entries(a.creature.setters).map(([k, v]) => [k, { value: v, attrs: {} }])),
      });
      rules.push({ kind: "grant", type: "Companion", id } as ARule);
    }
    if (a.choose) {
      const taken = t.rules.filter(a.choose.take);
      t.rules = t.rules.filter((r) => !a.choose!.take(r));
      const ids = a.choose.options.map((o) => {
        // An option with no rules of its own takes the target's rules of its kind (the descent's spells, the skill).
        const own =
          o.rules.length || o.key === "MASK" ? o.rules : taken.filter((r) => (o.key === "SKILL" ? r.kind === "select" : isSpell(r)));
        return make(`${base}_${o.key}`, o.name, o.text, own, { supports: [`${base} option`] }).id;
      });
      rules.push({
        kind: "select",
        type: ids.length ? byId.get(ids[0])!.type : "Racial Trait",
        name: a.choose.name,
        supports: ids.join("|"),
        number: 1,
      });
    }
    make(base, t.name, a.choose ? `${a.choose.name}.` : "The choice this feature's text gives.", rules);
    t.rules = [...t.rules, { kind: "grant", type: byId.get(base)!.type, id: base } as ARule];
    if (a.gate) {
      const g = byId.get(a.gate.id);
      for (const r of g?.rules ?? [])
        if (a.gate.rule(r) && !(r.requirements ?? "").includes(a.gate.not))
          r.requirements = r.requirements ? `${r.requirements},!${a.gate.not}` : `!${a.gate.not}`;
    }
    n++;
  }
  if (n && !byId.has(ADDITIONS_SOURCE_ID))
    byId.set(ADDITIONS_SOURCE_ID, {
      id: ADDITIONS_SOURCE_ID,
      name: ADDITIONS_SOURCE,
      type: "Source",
      source: ADDITIONS_SOURCE,
      supports: [],
      description:
        "<p>Choices and gifts a book's text states that 5e.tools' data does not give, built by Soul Forge so the character gets what the book says. Each one names the book and the sentence it follows.</p>",
      compendiumHidden: true,
      setters: {
        official: { value: "false", attrs: {} },
        abbreviation: { value: "SF", attrs: {} },
        group: { value: "homebrew", attrs: {} },
      },
      rules: [],
      origin: "soulforge",
    });
  return n;
}
