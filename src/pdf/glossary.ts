/**
 * A list of terms with fixed translations: skills, weapons, rules words, and anything the player adds for their language.
 * Machine translation turns names into odd phrases, so a term found here is used as it is and the service never sees it.
 * The built-in terms are a starting point for a few languages; each player's own terms win over them.
 */
export type Glossary = Record<string, string>;

const key = (s: string) => s.trim().toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ");

/** One term per line: `English = translation`. Lines starting with # are notes. */
export function parseGlossary(text: string): Glossary {
  const out: Glossary = {};
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const cut = l.search(/\s=\s|\t|;/);
    if (cut < 1) continue;
    const term = l.slice(0, cut).trim();
    const to = l.slice(cut).replace(/^\s*(=|;|\t)\s*/, "").trim();
    if (term && to) out[key(term)] = to;
  }
  return out;
}

export function serializeGlossary(g: Glossary): string {
  return Object.entries(g).sort(([a], [b]) => a.localeCompare(b)).map(([a, b]) => `${a} = ${b}`).join("\n");
}

/** The translation of a whole string if it is a term. A leading count ("2 Dagger") stays in front. */
export function lookup(g: Glossary, s: string): string | undefined {
  const direct = g[key(s)];
  if (direct) return direct;
  const m = s.trim().match(/^(\d+)\s+(.+)$/);
  if (m) {
    const t = g[key(m[2])];
    if (t) return `${m[1]} ${t}`;
  }
  return undefined;
}

const SKILLS = ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"];

/** Starter terms. They follow the usual wording of the published translations from memory, so players should review them. */
const SEED: Record<string, { skills: string[]; terms: Record<string, string> }> = {
  de: {
    skills: ["Akrobatik", "Umgang mit Tieren", "Arkane Kunde", "Athletik", "Täuschen", "Geschichte", "Motiv erkennen", "Einschüchtern", "Nachforschungen", "Medizin", "Naturkunde", "Wahrnehmung", "Darbietung", "Überzeugen", "Religion", "Fingerfertigkeit", "Heimlichkeit", "Überleben"],
    terms: {
      "Advantage": "Vorteil", "Disadvantage": "Nachteil", "Saving Throw": "Rettungswurf", "Armor Class": "Rüstungsklasse", "Hit Points": "Trefferpunkte", "Proficiency Bonus": "Übungsbonus",
      "Spell Slot": "Zauberplatz", "Concentration": "Konzentration", "Cantrip": "Zaubertrick", "Bonus Action": "Bonusaktion", "Reaction": "Reaktion", "Initiative": "Initiative", "Speed": "Bewegungsrate",
      "Dagger": "Dolch", "Quarterstaff": "Kampfstab", "Longsword": "Langschwert", "Shortsword": "Kurzschwert", "Handaxe": "Handaxt", "Mace": "Streitkolben", "Spear": "Speer", "Javelin": "Wurfspeer",
      "Light Crossbow": "Leichte Armbrust", "Shortbow": "Kurzbogen", "Longbow": "Langbogen", "Rapier": "Rapier", "Scimitar": "Krummsäbel", "Warhammer": "Kriegshammer", "Club": "Knüppel",
    },
  },
  fr: {
    skills: ["Acrobaties", "Dressage", "Arcanes", "Athlétisme", "Tromperie", "Histoire", "Perspicacité", "Intimidation", "Investigation", "Médecine", "Nature", "Perception", "Représentation", "Persuasion", "Religion", "Escamotage", "Discrétion", "Survie"],
    terms: {
      "Advantage": "Avantage", "Disadvantage": "Désavantage", "Saving Throw": "Jet de sauvegarde", "Armor Class": "Classe d'armure", "Hit Points": "Points de vie", "Proficiency Bonus": "Bonus de maîtrise",
      "Spell Slot": "Emplacement de sort", "Concentration": "Concentration", "Cantrip": "Sort mineur", "Bonus Action": "Action bonus", "Reaction": "Réaction", "Initiative": "Initiative", "Speed": "Vitesse",
      "Dagger": "Dague", "Quarterstaff": "Bâton", "Longsword": "Épée longue", "Shortsword": "Épée courte", "Handaxe": "Hachette", "Mace": "Masse d'armes", "Spear": "Lance", "Javelin": "Javeline",
      "Light Crossbow": "Arbalète légère", "Shortbow": "Arc court", "Longbow": "Arc long", "Rapier": "Rapière", "Scimitar": "Cimeterre", "Warhammer": "Marteau de guerre", "Club": "Gourdin",
    },
  },
  es: {
    skills: ["Acrobacias", "Trato con animales", "Arcanos", "Atletismo", "Engaño", "Historia", "Perspicacia", "Intimidación", "Investigación", "Medicina", "Naturaleza", "Percepción", "Interpretación", "Persuasión", "Religión", "Juego de manos", "Sigilo", "Supervivencia"],
    terms: {
      "Advantage": "Ventaja", "Disadvantage": "Desventaja", "Saving Throw": "Tirada de salvación", "Armor Class": "Clase de armadura", "Hit Points": "Puntos de golpe", "Proficiency Bonus": "Bonificador de competencia",
      "Spell Slot": "Espacio de conjuro", "Concentration": "Concentración", "Cantrip": "Truco", "Reaction": "Reacción", "Initiative": "Iniciativa", "Speed": "Velocidad",
      "Dagger": "Daga", "Quarterstaff": "Bastón", "Longsword": "Espada larga", "Shortsword": "Espada corta", "Handaxe": "Hacha de mano", "Mace": "Maza", "Spear": "Lanza", "Javelin": "Jabalina",
      "Light Crossbow": "Ballesta ligera", "Shortbow": "Arco corto", "Longbow": "Arco largo", "Rapier": "Estoque", "Scimitar": "Cimitarra", "Warhammer": "Martillo de guerra", "Club": "Garrote",
    },
  },
};

/** Languages with built-in starter terms. */
export const SEEDED = Object.keys(SEED);

export function seedFor(lang: string): Glossary {
  const s = SEED[lang];
  if (!s) return {};
  const out: Glossary = {};
  SKILLS.forEach((k, i) => (out[key(k)] = s.skills[i]));
  for (const [k, v] of Object.entries(s.terms)) out[key(k)] = v;
  return out;
}

/** Built-in terms with the player's own on top. */
export function glossaryFor(lang: string, userText: string): Glossary {
  return { ...seedFor(lang), ...parseGlossary(userText) };
}
