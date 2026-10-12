/**
 * Fills a fillable character sheet Soul Forge has never seen. Each field is read for what it is called, and what its tooltip says,
 * then matched to a piece of the character: name, class, scores, skills, attacks, spells and so on. What cannot be matched
 * is left alone and reported, so the player knows what to type in by hand.
 */
import { splitPersonality, type FillData } from "./data";
import type { Sink, W } from "./forms";

export interface AutoField extends W {
  /** The field's tooltip, which many sheets use to say what the field is for. */
  tip?: string;
  /** What the field really is, when the sheet's own name for it is wrong. */
  alias?: string;
  /** The printed label found next to the field, for sheets whose field names say nothing. */
  label?: string;
  multiline?: boolean;
}

export type Plan = Map<string, AutoField[]>;

/** Names that say nothing, like "Text Field12" or "Check Box7". For those the printed label is the better clue. */
const GENERIC_NAME = /^(text ?field|textfield|field|text|check ?box|checkbox|button|undefined|untitled)[\s_.-]*\d*$/i;

/** The printed words nearest each field: right below, to the left on the same line, or just above. */
export function attachLabels(fields: AutoField[], words: { p: number; text: string; x: number; y: number; w: number; h: number }[]): AutoField[] {
  return fields.map((f) => {
    if (f.label) return f;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    const score = (w: (typeof words)[number]): number => {
      const wx = w.x + w.w / 2;
      const wy = w.y + w.h / 2;
      const below = f.y - (w.y + w.h) ;
      if (Math.abs(wx - cx) < Math.max(f.w, w.w) / 2 + 6 && below > -3 && below < 18) return below + 2; // label printed under the box
      if (Math.abs(wy - cy) < Math.max(f.h, w.h) / 2 + 3 && w.x + w.w <= f.x + 2 && f.x - (w.x + w.w) < 40) return f.x - (w.x + w.w) + 4; // label to the left
      const above = w.y - (f.y + f.h);
      if (Math.abs(wx - cx) < Math.max(f.w, w.w) / 2 + 6 && above > -3 && above < 14) return above + 8; // label above
      return Infinity;
    };
    const best = words.filter((w) => w.p === f.p).map((w) => ({ w, s: score(w) })).filter((x) => x.s !== Infinity).sort((a, b) => a.s - b.s)[0];
    return best ? { ...f, label: best.w.text.trim() } : f;
  });
}

const ABIL = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma", chr: "charisma" } as const;
type A3 = keyof typeof ABIL;

const SKILLS: [string, RegExp][] = [
  ["acrobatics", /acrobat/], ["animal handling", /animal/], ["arcana", /arcana/], ["athletics", /athlet/], ["deception", /decept/], ["history", /histor/], ["insight", /insight/],
  ["intimidation", /intimid/], ["investigation", /investig/], ["medicine", /medic/], ["nature", /^nature|nature$|\bnature\b/], ["perception", /^perception|perception$/], ["performance", /perform/],
  ["persuasion", /persua/], ["religion", /relig/], ["sleight of hand", /sleight/], ["stealth", /stealth/], ["survival", /surviv/],
];

const norm = (s: string) => s.toLowerCase().replace(/[_\-./\\()[\]:]+/g, " ").replace(/\s+/g, " ").trim();
const squash = (s: string) => norm(s).replace(/ /g, "");

/** What a text field is, as a key, or nothing when it cannot be told. */
export function classify(f: AutoField): string | undefined {
  const generic = GENERIC_NAME.test(f.name.trim());
  const raw = f.alias ? norm(f.alias) : generic && f.label ? norm(f.label) : norm(f.name);
  const tip = f.alias ? "" : norm(f.tip ?? "");
  const both = `${raw} ${tip}`.trim();
  const sq = squash(f.alias ?? f.name);
  const pick = (re: RegExp) => re.test(raw) || re.test(sq) || (tip !== "" && re.test(tip));

  // Rows of attacks and spells come first, because their words overlap with others.
  const wpn = raw.match(/(?:wpn|weapon|attack)s?\s*(\d+)?\s*(name|atk\s*bonus|attack\s*bonus|bonus|dmg|damage|notes?|type|range)?/);
  if (wpn && /(wpn|weapon)/.test(raw) && (wpn[1] || /name|atk|bonus|damage|dmg/.test(raw))) {
    const row = wpn[1] ?? (raw.match(/(\d+)\s*$/)?.[1]) ?? "1";
    const what = /name/.test(raw) ? "name" : /atk|attack|bonus|dc/.test(raw) ? "bonus" : /dam|dmg/.test(raw) ? "damage" : /note/.test(raw) ? "notes" : "name";
    return `weapon.${row}.${what}`;
  }
  if (/^spells?\s*\d+$/.test(raw) || /^spell\s*name\s*\d*$/.test(raw) || /^spell\s*\d+\s*name$/.test(raw)) return "spell.name";
  if (/^spell\s*level\s*\d*$/.test(raw)) return "spell.level";
  if (/^(casting time|spell casting time)\s*\d*$/.test(raw)) return "spell.time";
  if (/^(range|spell range)\s*\d*$/.test(raw)) return "spell.range";
  if (/^(spell\s*)?(notes?|duration)\s*\d*$/.test(raw) && /spell/.test(raw)) return "spell.notes";

  if (pick(/spell.*(save|dc)|spellsavedc/)) return "casting.dc";
  if (pick(/spell.*(atk|attack)/)) return "casting.attack";
  if (pick(/spell.*(abil)|spellcasting ability/)) return "casting.ability";
  if (pick(/spellcasting.*(mod)/)) return "casting.mod";
  if (pick(/spellcasting class|spell class/)) return "casting.class";
  // Spell slot fields: the number may be the level (LVL1 TOTAL) or just a running number on the sheet (SlotsTotal 19).
  const slot = raw.match(/(?:lvl|level|slots?)\s*(\d+)\s*(total|slots?)?|(?:slots?)\s*(?:total|remaining|expended)\s*(\d+)/);
  if (slot && /slot|total/.test(raw)) {
    const n = slot[1] ?? slot[3];
    // The official sheets name the box "SlotsRemaining", but print "slots expended" over it.
    if (/expend|used/.test(raw) || /^slotsremaining\s*\d+$/.test(raw.replace(/\s+/g, " ").trim())) return `slots.${n}.used`;
    return /remain/.test(raw) ? `slots.${n}.left` : `slots.${n}.total`;
  }
  const att = raw.match(/attun\w*\s*(\d+)?/);
  if (att && /attun/.test(raw)) return `attune.${att[1] ?? "1"}`;

  if (/^savingthrows?\d*$/.test(sq)) return "save.seq";
  // Abilities, saves and modifiers, read word by word so "Strength Modifier", "str_mod" and "Saving Throw - STR" all work.
  const words = norm(raw).split(" ");
  const abilityWord = words.map((w) => (Object.keys(ABIL) as A3[]).find((k) => w === k || w === ABIL[k] || w.startsWith(ABIL[k].slice(0, 6)))).find(Boolean);
  if (abilityWord && words.length <= 5 && !/skill|check box/.test(raw)) {
    const full = ABIL[abilityWord];
    if (words.some((w) => /^(save|saves|saving|st)$/.test(w) || w === "throw")) return `${full}.save`;
    if (words.some((w) => /^(mod|modifier|bonus)$/.test(w))) return `${full}.mod`;
    if (words.every((w) => w === abilityWord || w === ABIL[abilityWord] || /^(score|total|value|ability)$/.test(w))) return `${full}.score`;
  }
  // Abilities, saves and modifiers
  const ab = (Object.keys(ABIL) as A3[]).find((k) => new RegExp(`^(st\\s*)?${k}|${k}(ength|terity|stitution|elligence|dom|isma)?`).test(raw));
  if (ab) {
    const full = ABIL[ab];
    if (/save|saving|^st /.test(raw) || (/\bst\b/.test(raw))) return `${full}.save`;
    if (/mod|bonus/.test(raw)) return `${full}.mod`;
    if (new RegExp(`^${ab}(\\s*(score|total))?$`).test(raw) || new RegExp(`^${full}(\\s*score)?$`).test(raw)) return `${full}.score`;
  }
  for (const [skill, re] of SKILLS) if (re.test(raw) && raw.split(" ").length <= 4 && !/save|spell/.test(raw)) return `skill.${skill}`;

  const pairs: [RegExp, string][] = [
    [/^(char(acter)?\s*name|name|charactername\s*\d*)$/, "name"],
    [/class\s*(&|and)?\s*level|classlevel/, "classLevel"],
    [/^class(es)?$/, "class"],
    [/^(race|species|ancestry|lineage)\b/, "species"],
    [/^background$/, "background"],
    [/^(sub\s*class|archetype)$/, "subclass"],
    [/^(level|lvl)$/, "level"],
    [/^(alignment)$/, "alignment"],
    [/^(xp|exp|experience( points)?)(\s*points)?$/, "xp"],
    [/player/, "player"],
    [/spent.*(hd|hit dice)/, "hd.spent"], [/max.*(hd|hit dice)/, "hd.max"],
    [/^(hp|hit points?)\s*(max|maximum)|^max\s*hp|hpmax|hit point maximum/, "hp.max"],
    [/^(hp|hit points?)\s*(cur|current)|^current\s*hp|hpcurrent|current hit/, "hp.current"],
    [/(temp|temporary)\s*(hp|hit)|hptemp/, "hp.temp"],
    [/^(hp|hit points)$/, "hp.current"],
    [/^(ac|armor class|armour class)$/, "ac"],
    [/^(init|initiative)$/, "initiative"],
    [/^speed$|^walking speed$/, "speed"],
    [/^size$/, "size"],
    [/^(prof|proficiency)\s*(bonus)?$|profbonus/, "prof"],
    [/passive/, "passive"],
    [/^inspiration$|heroic inspiration/, "inspiration"],
    [/hit dice|^hd\b|^hdtotal|total hit dice/, "hd"],
    [/^(cp|copper)$/, "coin.cp"], [/^(sp|silver)$/, "coin.sp"], [/^(ep|electrum)$/, "coin.ep"], [/^(gp|gold)$/, "coin.gp"], [/^(pp|platinum)$/, "coin.pp"],
    [/feat\s*\+?\s*traits|additional.*(features|traits)/, "extra"],
    [/features?\s*(&|and|\+)?\s*traits?|^features$|class features/, "features"],
    [/^personality( traits)?$|^personalitytraits$|^traits$/, "personality"], [/^ideals?$/, "ideals"], [/^bonds?$/, "bonds"], [/^flaws?$/, "flaws"],
    [/^(age)$/, "age"], [/^height$/, "height"], [/^weight$/, "weight"], [/^eyes$/, "eyes"], [/^skin$/, "skin"], [/^hair$/, "hair"],
    [/faction/, "faction"], [/appearance/, "appearance"], [/back\s*story|^backstory|background story/, "backstory"], [/^allies|organi[sz]ations/, "allies"], [/^treasure/, "treasure"],
    [/features?\s*(&|and|\+)?\s*traits?|^features$|class features/, "features"], [/species traits|racial traits|race traits/, "traits"], [/^feats$/, "feats"],
    [/^equipment|^gear|^inventory/, "equipment"], [/languages?\s*(&|and)?\s*prof|^other prof|^proficiencies|prof.*lang|languages/, "profs"], [/^tool/, "tools"], [/^weapon prof/, "weaponProf"],
    [/attacks.*spell|attacks & spell/, "attacksText"], [/^notes?$|additional/, "notes"],
  ];
  for (const [re, key] of pairs) if (re.test(raw) || re.test(sq) || (tip && re.test(tip) && !/\d/.test(tip))) return key;
  void both;
  return undefined;
}

const ALPHA = SKILLS.map(([k]) => k).sort();

/** Some sheets give two fields the same name; when a skill is missing, the odd duplicate is that skill, judged by its neighbours. */
function fixDuplicateSkills(fields: AutoField[], keys: Map<AutoField, string | undefined>): void {
  const skillOf = (f: AutoField) => keys.get(f)?.replace(/^skill\./, "");
  const skillKeys = fields.filter((f) => keys.get(f)?.startsWith("skill."));
  const count = new Map<string, AutoField[]>();
  for (const f of skillKeys) (count.get(skillOf(f)!) ?? count.set(skillOf(f)!, []).get(skillOf(f)!)!).push(f);
  const missing = ALPHA.filter((k) => !count.has(k));
  const dups = [...count.entries()].filter(([, l]) => l.length > 1);
  if (missing.length !== 1 || dups.length !== 1) return;
  const [m] = missing;
  const [dupName, list] = dups[0];
  const before = ALPHA[ALPHA.indexOf(m) - 1];
  const after = ALPHA[ALPHA.indexOf(m) + 1];
  const nearest = (f: AutoField, up: boolean) =>
    skillKeys.filter((o) => o !== f && o.p === f.p && Math.abs(o.x - f.x) < 40 && (up ? o.y > f.y : o.y < f.y)).sort((x, y) => Math.abs(x.y - f.y) - Math.abs(y.y - f.y))[0];
  const score = (f: AutoField) => (skillOf(nearest(f, true) ?? f) === before ? 1 : 0) + (skillOf(nearest(f, false) ?? f) === after ? 1 : 0);
  const odd = list.slice().sort((x, y) => score(y) - score(x))[0];
  if (odd && dupName) keys.set(odd, `skill.${m}`);
}

/** Everything that can be matched, grouped by what it is. One entry per field, so a name used twice can mean two things. */
export function buildPlan(fields: AutoField[]): { plan: Plan; unmatched: AutoField[] } {
  const plan: Plan = new Map();
  const unmatched: AutoField[] = [];
  const tx = fields.filter((f) => f.t === "Tx");
  const keys = new Map<AutoField, string | undefined>(tx.map((f) => [f, classify(f)]));
  fixDuplicateSkills(tx, keys);
  const seen = new Set<string>();
  for (const f of tx) {
    const key = keys.get(f);
    if (!key) {
      if (!seen.has(f.name)) unmatched.push(f);
      seen.add(f.name);
      continue;
    }
    (plan.get(key) ?? plan.set(key, []).get(key)!).push(f);
  }
  return { plan, unmatched };
}

const cy = (w: W) => w.y + w.h / 2;
const cx = (w: W) => w.x + w.w / 2;

/** Check boxes beside a field: nearest one at the same height, on its left, then on its right. */
function boxBeside(all: AutoField[], f: W): W | undefined {
  const near = all.filter((b) => b.t === "Btn" && b.p === f.p && Math.abs(cy(b) - cy(f)) <= 6);
  const left = near.filter((b) => cx(b) < f.x + 2 && f.x - cx(b) <= 34).sort((a, b) => cx(b) - cx(a))[0];
  return left ?? near.filter((b) => cx(b) > f.x + f.w - 2 && cx(b) - (f.x + f.w) <= 20).sort((a, b) => cx(a) - cx(b))[0];
}

export interface AutoResult {
  matched: number;
  total: number;
  /** Field names that could not be matched, for the player to fill in by hand. */
  unmatched: string[];
}

/** Writes the character into a sheet using what the field names and tooltips say. */
export function autoFill(fields: AutoField[], d: FillData, sink: Sink): AutoResult {
  const { plan, unmatched } = buildPlan(fields);
  let matched = 0;
  const put = (key: string, value: string | number | undefined, multi = false) => {
    const list = plan.get(key);
    if (!list || value === undefined || String(value) === "") return;
    for (const f of list) {
      sink.text(f, String(value));
      matched++;
    }
    void multi;
  };
  const abilities = Object.keys(d.abilities) as (keyof FillData["abilities"])[];
  put("name", d.name); put("class", d.className); put("species", d.species); put("background", d.background); put("subclass", d.subclass);
  put("classLevel", [d.className, d.level].filter(Boolean).join(" ")); put("level", d.level); put("alignment", d.alignment); put("xp", d.xp || ""); put("player", "");
  put("hp.max", d.hpMax); put("hp.current", d.hpCurrent); put("hp.temp", d.hpTemp || ""); put("ac", d.ac); put("initiative", d.initiative); put("speed", d.speed ? `${d.speed} ft` : "");
  put("size", d.size); put("prof", d.profBonus); put("hd", d.hdMax);
  put("passive", d.passive);
  put("inspiration", d.inspiration ? "1" : "");
  for (const a of abilities) {
    const ab = d.abilities[a];
    put(`${a}.score`, ab.score); put(`${a}.mod`, ab.mod);
    for (const f of plan.get(`${a}.save`) ?? []) {
      sink.text(f, ab.save); matched++;
      const box = boxBeside(fields, f);
      if (box) sink.check(box, ab.saveProf);
    }
  }
  // Saving throws named by number only: top to bottom they are Strength to Charisma.
  (plan.get("save.seq") ?? []).slice().sort((x, y) => x.p - y.p || y.y - x.y || x.x - y.x).forEach((f, i) => {
    const a = abilities[i];
    if (!a) return;
    sink.text(f, d.abilities[a].save); matched++;
    const box = boxBeside(fields, f);
    if (box) sink.check(box, d.abilities[a].saveProf);
  });
  for (const [skill, k] of Object.entries(d.skills)) {
    for (const f of plan.get(`skill.${skill}`) ?? []) {
      sink.text(f, k.bonus); matched++;
      const box = boxBeside(fields, f);
      if (box) sink.check(box, k.prof || k.expert);
    }
  }
  for (const k of ["cp", "sp", "ep", "gp", "pp"] as const) put(`coin.${k}`, d.coins[k] === "0" ? "" : d.coins[k]);
  d.weapons.slice(0, 8).forEach((w, i) => {
    const row = String(i + 1);
    put(`weapon.${row}.name`, w.name); put(`weapon.${row}.bonus`, w.bonus); put(`weapon.${row}.damage`, w.damage); put(`weapon.${row}.notes`, w.notes);
  });
  const feat = (g: string) => d.featureList.filter((f) => f.group === g).map((f) => `${f.name}${f.usage ? ` (${f.usage})` : ""}: ${f.text}`).join("\n");
  const allFeatures = d.featureList.map((f) => `${f.name}${f.usage ? ` (${f.usage})` : ""}: ${f.text}`).join("\n");
  put("features", plan.has("traits") ? feat("Class features") : allFeatures); put("traits", feat("Species traits")); put("feats", feat("Feats"));
  put("equipment", [d.armorWorn, d.weaponsText.replace(/\n/g, ", "), d.otherGear.replace(/\n/g, ", ")].filter(Boolean).join("\n"));
  put("profs", [d.languages && `Languages: ${d.languages}`, d.tools && `Tools: ${d.tools}`].filter(Boolean).join("\n")); put("tools", d.tools);
  put("weaponProf", [d.weaponTraining.simple && "Simple", d.weaponTraining.martial && "Martial"].filter(Boolean).join(", "));
  const person = splitPersonality(d.personality);
  const split = person.found && (plan.has("ideals") || plan.has("bonds"));
  if (split) { put("ideals", person.ideals); put("bonds", person.bonds); put("flaws", person.flaws); }
  put("personality", split ? person.traits : d.personality);
  put("age", d.body.age); put("height", d.body.height); put("weight", d.body.weight); put("eyes", d.body.eyes); put("skin", d.body.skin); put("hair", d.body.hair); put("faction", d.body.deity);
  put("extra", d.notes); put("allies", d.body.allies);
  put("backstory", d.backstory); put("appearance", d.appearance); put("notes", d.notes); put("treasure", d.magicItems.map((m) => m.name).join(", "));
  put("attacksText", d.casting ? `Spell save DC ${d.casting.dc}, spell attack ${d.casting.attack}` : "");
  if (d.casting) { put("casting.ability", d.casting.ability); put("casting.mod", d.casting.mod); put("casting.dc", d.casting.dc); put("casting.attack", d.casting.attack); put("casting.class", d.className); }
  // Slot fields are numbered either by level or by a running number; rank the numbers to get the level.
  const slotNums = [...new Set([...plan.keys()].map((k) => k.match(/^slots\.(\d+)\./)?.[1]).filter(Boolean).map(Number))].sort((a, b) => a - b);
  slotNums.forEach((n, i) => {
    const level = slotNums[slotNums.length - 1] > 9 ? i + 1 : n;
    const total = d.casting?.slots[level - 1] ?? 0;
    if (!total) return;
    put(`slots.${n}.total`, total); put(`slots.${n}.left`, Math.max(0, total - (d.casting?.used[level - 1] ?? 0)));
    const spent = Math.min(total, d.casting?.used[level - 1] ?? 0);
    put(`slots.${n}.used`, spent || "");
  });
  d.magicItems.slice(0, 5).forEach((m, i) => put(`attune.${i + 1}`, m.name));
  put("hd.spent", d.hdSpent || ""); put("hd.max", d.hdMax);
  // Spells go into the spell name fields. Where the sheet has a heading per level (slot fields), each spell goes under its own level.
  const names = (plan.get("spell.name") ?? []).slice().sort((x, y) => x.p - y.p || Math.round(y.y / 4) - Math.round(x.y / 4) || x.x - y.x);
  const headers = [...plan.entries()].flatMap(([k, list]) => (/^slots\.\d+\.total$/.test(k) ? list.map((f) => ({ f, n: Number(k.split(".")[1]) })) : []));
  const lowest = Math.min(...headers.map((h) => h.n));
  const level = (f: AutoField): number => {
    const col = (x: number) => Math.floor(x / 204);
    const above = headers.filter((h) => h.f.p === f.p && col(h.f.x) === col(f.x) && h.f.y >= f.y).sort((x, y) => x.f.y - y.f.y)[0];
    return above ? (slotNums[slotNums.length - 1] > 9 ? above.n - lowest + 1 : above.n) : 0;
  };
  if (headers.length && d.spells.length) {
    const byLevel = new Map<number, AutoField[]>();
    for (const f of names) (byLevel.get(level(f)) ?? byLevel.set(level(f), []).get(level(f))!).push(f);
    const used = new Map<number, number>();
    for (const sp of d.spells) {
      const lv = Number(sp.level) || 0;
      const f = byLevel.get(lv)?.[used.get(lv) ?? 0];
      if (!f) continue;
      used.set(lv, (used.get(lv) ?? 0) + 1);
      sink.text(f, sp.name); matched++;
      const box = boxBeside(fields, f);
      if (box) sink.check(box, lv > 0 && (sp.prepared ?? /prepared|always/.test(sp.notes)));
    }
  } else {
    d.spells.slice(0, names.length).forEach((sp, i) => { sink.text(names[i], sp.name); matched++; });
  }
  // Check boxes that say what they are in their name, tooltip or printed label.
  for (const b of fields) {
    if (b.t !== "Btn") continue;
    const text = norm(`${GENERIC_NAME.test(b.name.trim()) ? "" : b.name} ${b.tip ?? ""} ${b.label ?? ""}`);
    if (!text.trim()) continue;
    if (/inspiration/.test(text)) { sink.check(b, d.inspiration); continue; }
    const n = Number(text.match(/(\d)\s*$/)?.[1] ?? 0);
    if (/death/.test(text) || /succes|fail/.test(text)) {
      if (/succes/.test(text)) sink.check(b, n ? d.deathSuccess >= n : d.deathSuccess > 0);
      else if (/fail/.test(text)) sink.check(b, n ? d.deathFail >= n : d.deathFail > 0);
      continue;
    }
    const skill = SKILLS.find(([, re]) => re.test(text));
    if (skill && /prof|expert/.test(text)) { const k = d.skills[skill[0]]; if (k) sink.check(b, /expert/.test(text) ? k.expert : k.prof || k.expert); continue; }
    const ab = abilities.find((a) => new RegExp(`\\b(${a.slice(0, 3)}|${a})\\b`).test(text));
    if (ab && /save|saving/.test(text) && /prof/.test(text)) { sink.check(b, d.abilities[ab].saveProf); continue; }
    if (/(armor|armour).*(light|medium|heavy|shield)|^(light|medium|heavy|shields?)\b/.test(text)) {
      const kind = /light/.test(text) ? "light" : /medium/.test(text) ? "medium" : /heavy/.test(text) ? "heavy" : "shield";
      sink.check(b, d.armorTraining[kind as keyof FillData["armorTraining"]]);
    }
  }
  for (const b of fields) if (b.t === "Btn" && /character.?image|portrait|picture/i.test(b.name) && !/faction|symbol/i.test(b.name)) sink.image?.(b);
  return { matched, total: new Set(fields.filter((f) => f.t === "Tx").map((f) => f.name)).size, unmatched: unmatched.map((u) => u.name.trim()) };
}
