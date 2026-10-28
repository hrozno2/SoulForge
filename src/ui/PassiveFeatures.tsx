import type { Resolved } from "../aurora/engine";
import { fixedChoice } from "./Slots";
import { ABILITY_IDS } from "../aurora/character";
import { Html } from "./Html";

/** Kinds of element that are a feature the player reads (senses, traits, class and background features, feats). */
const FEATURE_TYPES = new Set(["Vision", "Racial Trait", "Class Feature", "Archetype Feature", "Background Feature", "Feat", "Feat Feature", "Optional Feature", "Class Feature Option"]);
const LABEL: Record<string, string> = { strength: "Strength", dexterity: "Dexterity", constitution: "Constitution", intelligence: "Intelligence", wisdom: "Wisdom", charisma: "Charisma" };

/**
 * What a part of the build gives without a choice (a species' Darkvision, a background's feature, a class's
 * features so far), each as an explanation that opens on a click, under the choices in its card. Picks the player
 * made are left out (they are in the choices above), so nothing shows twice. The first line sums the ability
 * increases the part gives, fixed or chosen, so a species with fixed increases shows them too.
 */
export function PassiveFeatures({ r, root }: { r: Resolved; root: (root: string) => boolean }) {
  // Picks are shown with their choice; a choice with only one option is no choice, so its pick is shown here instead.
  const picked = new Set(r.slots.filter((s) => !fixedChoice(s)).flatMap((s) => s.chosen));
  const mine = r.active.filter((a) => root(a.root));
  const seen = new Set<string>();
  const features = mine.filter((a) => {
    // Features the sheet shows as a number (Dwarven Toughness) are still explained here.
    if (!FEATURE_TYPES.has(a.el.type) || picked.has(a.el.id)) return false;
    const key = a.el.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const increases = new Map<string, number>();
  for (const a of mine) for (const rule of a.el.rules) {
    if (rule.kind !== "stat" || !(ABILITY_IDS as readonly string[]).includes(rule.name.toLowerCase())) continue;
    if (rule.level !== undefined && rule.level > a.ownerLevel) continue;
    const v = Number(rule.value);
    if (Number.isFinite(v) && v) increases.set(rule.name.toLowerCase(), (increases.get(rule.name.toLowerCase()) ?? 0) + v);
  }
  if (!features.length && !increases.size) return null;
  return (
    <section className="passive-features">
      <h3>What you get</h3>
      {increases.size > 0 && (
        <p className="passive-asi">
          <b>Ability scores:</b> {[...increases].map(([a, v]) => `${LABEL[a] ?? a} ${v > 0 ? "+" : ""}${v}`).join(", ")}
        </p>
      )}
      {features.map((a) => (
        <details key={a.el.id} className="passive-feature">
          <summary>{a.el.name.replace(/^Level \d+:\s*/, "")}</summary>
          <Html html={a.el.description || "<p>No description in the content file.</p>"} />
        </details>
      ))}
    </section>
  );
}
