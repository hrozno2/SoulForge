import { ABILITY_IDS, SKILL_ABILITY, type AbilityId } from "./character";

export interface Contribution {
  /** A number, or the name of another statistic. */
  value: string;
  bonus?: string;
  from: string;
  alt?: string;
  inline?: boolean;
}

/** Facts about the character the stat book needs for its built-in statistics. */
export interface StatInputs {
  abilityBase: Record<AbilityId, number>;
  totalLevel: number;
  /** Levels per class, keyed by lowercase class name. */
  classLevels: Record<string, number>;
  attunedCount: number;
  /** Ability (full name, lowercase) used by each spellcasting entry, keyed by lowercase name. */
  spellAbility: Record<string, string>;
  /** Hit points from the character's hit dice, constitution and rolls, computed by the engine. */
  baseHp: (conMod: number) => number;
}

const half = (n: number, up: boolean) => (up ? Math.ceil(n / 2) : Math.floor(n / 2));

/**
 * Holds every stat rule that applies and answers questions like "wisdom:modifier" or "acrobatics".
 * Stat rules with the same name add up, except rules sharing a `bonus` type, where the highest wins.
 */
export class StatBook {
  private contribs = new Map<string, Contribution[]>();
  private cache = new Map<string, number>();
  private busy = new Set<string>();

  constructor(private inputs: StatInputs) {}

  add(name: string, c: Contribution): void {
    const key = name.toLowerCase();
    (this.contribs.get(key) ?? this.contribs.set(key, []).get(key)!).push(c);
  }

  names(): string[] {
    return [...this.contribs.keys()];
  }

  contributions(name: string): Contribution[] {
    return this.contribs.get(name.toLowerCase()) ?? [];
  }

  has(name: string): boolean {
    return this.contribs.has(name.toLowerCase());
  }

  private evalValue(v: string): number {
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== "") return n;
    const t = v.trim().toLowerCase();
    return t.startsWith("-") ? -this.get(t.slice(1)) : this.get(t);
  }

  /** Sum of contributions, taking only the best of each bonus group. */
  private aggregate(name: string): number {
    const list = this.contribs.get(name);
    if (!list) return 0;
    let plain = 0;
    const groups = new Map<string, number>();
    for (const c of list) {
      if (c.inline) continue;
      const v = this.evalValue(c.value);
      if (c.bonus) groups.set(c.bonus, Math.max(groups.get(c.bonus) ?? -Infinity, v));
      else plain += v;
    }
    let total = plain;
    for (const v of groups.values()) total += v;
    return total;
  }

  get(rawName: string): number {
    const name = rawName.toLowerCase().trim();
    const hit = this.cache.get(name);
    if (hit !== undefined) return hit;
    if (this.busy.has(name)) return 0;
    this.busy.add(name);
    let v: number;
    try {
      v = this.compute(name);
    } finally {
      this.busy.delete(name);
    }
    this.cache.set(name, v);
    return v;
  }

  private compute(name: string): number {
    const inp = this.inputs;

    // Ability scores and modifiers.
    if ((ABILITY_IDS as readonly string[]).includes(name)) {
      const id = name as AbilityId;
      const raw = inp.abilityBase[id] + this.aggregate(name);
      // Increases stop at 20 (or a raised maximum); a score that already starts higher stays as it is.
      const max = Math.max(20 + this.aggregate(`${name}:max`), inp.abilityBase[id]);
      let score = Math.min(raw, max);
      if (this.contribs.has(`${name}:score:set`)) score = Math.max(score, this.aggregate(`${name}:score:set`));
      return score;
    }
    const mod = name.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma):modifier$/);
    if (mod) return Math.floor((this.get(mod[1]) - 10) / 2) + this.aggregate(name);
    const scoreAlias = name.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma):score$/);
    if (scoreAlias) return this.get(scoreAlias[1]);

    // Levels and proficiency.
    if (name === "level") return inp.totalLevel + this.aggregate(name);
    if (name === "level:half") return half(inp.totalLevel, false);
    if (name === "level:half:up") return half(inp.totalLevel, true);
    const lv = name.match(/^level:(.+?)(:half(?::up)?)?$/);
    if (lv && lv[1] in inp.classLevels) {
      const n = inp.classLevels[lv[1]];
      return lv[2] ? half(n, lv[2] === ":half:up") : n;
    }
    if (name === "proficiency") return 2 + Math.floor((Math.max(1, inp.totalLevel) - 1) / 4) + this.aggregate(name);
    if (name === "proficiency:half") return half(this.get("proficiency"), false);
    if (name === "proficiency:half:up") return half(this.get("proficiency"), true);

    // Saving throws.
    const save = name.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma):save$/);
    if (save)
      return this.get(`${save[1]}:modifier`) + this.aggregate(`${name}:proficiency`) + this.aggregate(`${name}:misc`) + this.aggregate(name);

    // Skills.
    const passive = name.match(/^(.+):passive$/);
    if (passive && passive[1] in SKILL_ABILITY) return 10 + this.get(passive[1]) + this.aggregate(name);
    if (name in SKILL_ABILITY) {
      return (
        this.get(`${SKILL_ABILITY[name]}:modifier`) + this.aggregate(`${name}:proficiency`) + this.aggregate(`${name}:misc`) + this.aggregate(name)
      );
    }

    if (name === "initiative") return this.get("dexterity:modifier") + this.aggregate("initiative:misc") + this.aggregate(name);

    // Movement.
    if (name === "speed") return this.get("innate speed") + this.aggregate("speed:misc") + this.aggregate(name);
    const sp = name.match(/^speed:(climb|fly|swim|burrow)$/);
    if (sp) return this.get(`innate speed:${sp[1]}`) + this.aggregate(`${name}:misc`) + this.aggregate(name);

    if (name === "hp") return inp.baseHp(this.get("constitution:modifier")) + this.aggregate("hp");
    if (name === "attunement:max") return 3 + this.aggregate(name);
    if (name === "attunement:current") return inp.attunedCount;

    // Spellcasting save DC, attack bonus and ability modifier, per spellcasting entry.
    const sc = name.match(/^(.+):spellcasting:(dc|attack|modifier)$/);
    if (sc) {
      const ability = inp.spellAbility[sc[1]];
      const m = ability ? this.get(`${ability}:modifier`) : 0;
      const prof = this.get("proficiency");
      const base = sc[2] === "dc" ? 8 + prof + m : sc[2] === "attack" ? prof + m : m;
      // Bonuses to every spellcasting line (Robe of the Archmagi, Wand of the War Mage, a custom bonus) add too.
      const all = sc[2] === "modifier" ? 0 : this.aggregate(`spellcasting:${sc[2]}`);
      return base + all + this.aggregate(name);
    }

    return this.aggregate(name);
  }

  /** Inline (text) stats such as `feature:damage type`, last one wins. */
  text(name: string): string | undefined {
    const list = this.contribs.get(name.toLowerCase())?.filter((c) => c.inline);
    return list && list.length ? list[list.length - 1].value : undefined;
  }
}
