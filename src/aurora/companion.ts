import type { ARegistry } from "./registry";

/**
 * Companion stat blocks keep their traits, actions and reactions as lists of element ids.
 * This turns such a value into readable HTML: one paragraph per entry, led by its name.
 */
export function companionHtml(value: string | undefined, reg: ARegistry | undefined): string {
  if (!value) return "";
  const parts = value.split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.some((p) => /^ID_[A-Z0-9_]+$/.test(p))) return value;
  return parts
    .map((p) => {
      if (!/^ID_[A-Z0-9_]+$/.test(p)) return `<p>${p}</p>`;
      const el = reg?.get(p);
      if (!el) return "";
      const body = el.description.replace(/^\s*<p[^>]*>/i, "").replace(/<\/p>\s*$/i, "");
      return `<p><b>${el.name}.</b> ${body}</p>`;
    })
    .join("");
}

/**
 * What the character's features add to a companion: the content's "companion:..." statistics (Ranger's Companion:
 * attacks and damage +proficiency; Soul Bond: saving throws), worked out for this character. "Attacks +3",
 * "Dexterity saves +2".
 */
export function companionBonuses(stats: { names(): string[]; get(n: string): number }): string[] {
  const out: string[] = [];
  const label = (rest: string) => {
    const save = /^(\w+):save(?::misc)?$/.exec(rest);
    if (save) return `${save[1].charAt(0).toUpperCase()}${save[1].slice(1)} saves`;
    const skill = /^(.+?):(?:misc|proficiency)$/.exec(rest);
    if (skill) return `${skill[1].replace(/s$/, "").replace(/^./, (c) => c.toUpperCase())}${/proficiency$/.test(rest) ? " (proficient)" : ""}`;
    return rest === "attack" ? "Attacks" : rest === "damage" ? "Damage" : rest === "ac" ? "AC" : rest.replace(/^./, (c) => c.toUpperCase());
  };
  for (const n of stats.names().filter((x) => x.startsWith("companion:")).sort()) {
    const v = stats.get(n);
    if (v) out.push(`${label(n.slice(10))} ${v >= 0 ? "+" : ""}${v}`);
  }
  return out;
}
