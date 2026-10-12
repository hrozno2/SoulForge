/** Fills the circular "Alternative 2" 2014 sheet. It has no form fields, so each box was measured on the page. */
import type { FillData } from "./data";
import type { Sink, W } from "./forms";

const find = (ws: W[], name: string) => ws.find((w) => w.name === name);

export function fillAlt2(ws: W[], d: FillData, sink: Sink): void {
  const put = (name: string, value: string | number | undefined) => {
    const w = find(ws, name);
    if (w && value !== undefined && String(value) !== "") sink.text(w, String(value));
  };
  put("name", d.name); put("alignment", d.alignment); put("race", d.species); put("class", [d.className, d.subclass && `(${d.subclass})`].filter(Boolean).join(" "));
  put("gender", d.body.gender); put("hair", d.body.hair); put("eyes", d.body.eyes); put("size", d.size); put("height", d.body.height); put("weight", d.body.weight);
  put("xp", d.xp || ""); put("level", d.level);
  const abil = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
  ["str", "dex", "con", "int", "wis", "cha"].forEach((k, i) => { put(`${k}.score`, d.abilities[abil[i]].score); put(`${k}.mod`, d.abilities[abil[i]].mod); });
  put("initiative", d.initiative); put("languages", d.languages); put("speed", d.speed ? `${d.speed} ft` : ""); put("vision", d.darkvision ? `Darkvision ${d.darkvision}` : "");
  put("hp.total", d.hpMax); put("hp.current", d.hpCurrent); put("hd.total", d.hdMax); put("hd.remaining", d.hdMax.replace(/^\d+/, String(Math.max(0, (parseInt(d.hdMax, 10) || 0) - d.hdSpent))));
  put("ac", d.ac);
  for (const k of ["cp", "sp", "ep", "gp", "pp"] as const) put(`coin.${k}`, d.coins[k] === "0" ? "" : d.coins[k]);
  d.weapons.slice(0, 4).forEach((wp, i) => {
    put(`wpn${i + 1}.name`, wp.name); put(`wpn${i + 1}.atk`, wp.bonus);
    const m = wp.damage.match(/^(\S+)\s*(.*)$/);
    put(`wpn${i + 1}.dmg`, m?.[1] ?? wp.damage); put(`wpn${i + 1}.type`, m?.[2] ?? "");
  });
  if (d.casting) {
    put("savedc", d.casting.dc);
    d.casting.slots.forEach((n, i) => { if (n) { put(`slot${i + 1}.total`, n); put(`slot${i + 1}.used`, d.casting!.used[i] || ""); } });
    // Cantrip attacks and damage go in the spell attack rows.
    const attacks = d.spells.filter((s) => s.level === "0").slice(0, 4);
    attacks.forEach((sp, i) => { put(`spa${i + 1}.name`, sp.name); put(`spa${i + 1}.atk`, d.casting!.attack); });
    const byLevel = ["cantrips", "l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9"];
    byLevel.forEach((k, lv) => put(`spells.${k}`, d.spells.filter((s) => Number(s.level) === lv).map((s) => s.name).join(", ")));
    put("prepared", d.spells.filter((s) => Number(s.level) > 0 && /prepared|always/.test(s.notes)).map((s) => s.name).join(", "));
  }
  const group = (g: string) => d.featureList.filter((f) => f.group === g).map((f) => `${f.name}${f.usage ? ` (${f.usage})` : ""}: ${f.text}`).join("\n");
  put("classfeatures", group("Class features")); put("racialtraits", group("Species traits"));
  put("prof", d.profBonus);
  put("saves", (Object.keys(d.abilities) as (keyof FillData["abilities"])[]).filter((a) => d.abilities[a].saveProf).map((a) => a.slice(0, 3).toUpperCase()).join(", "));
  put("tools", d.tools); put("weapons", [d.weaponTraining.simple && "Simple", d.weaponTraining.martial && "Martial"].filter(Boolean).join(", "));
  put("armors", [d.armorTraining.light && "Light", d.armorTraining.medium && "Medium", d.armorTraining.heavy && "Heavy", d.armorTraining.shield && "Shields"].filter(Boolean).join(", "));
  put("skills", Object.entries(d.skills).filter(([, k]) => k.prof).map(([n, k]) => `${n.replace(/\b\w/g, (c) => c.toUpperCase())} ${k.bonus}`).join(", "));
  const gear = [d.armorWorn, ...d.weaponsText.split("\n"), ...d.otherGear.split("\n")].filter(Boolean);
  gear.slice(0, 6).forEach((g, i) => put(`eq${i + 1}.name`, g));
  put("treasure", d.magicItems.map((m) => m.name).join("\n")); put("gems", gear.slice(6).join(", "));
  put("feats", group("Feats")); put("notes", d.notes); put("background", [d.personality, d.backstory].filter(Boolean).join("\n\n"));
  const pic = find(ws, "portrait");
  if (pic) sink.image?.(pic);
}
