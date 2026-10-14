/**
 * The content linter: problems in the content itself, found once when it loads rather than when a character trips
 * over them. AuroraLegacy is community-made; most mistakes Soul Forge ran into came from it.
 */
import type { ARegistry } from "./registry";
import type { AElement } from "./types";
import { ID_TYPOS } from "./contentFixes";

export interface LintFinding {
  /** What kind of problem: "missing grant", "empty choice", "missing requirement". */
  kind: string;
  id: string;
  name: string;
  detail: string;
}

const DEFENSE = /^ID_INTERNAL_CONDITION_DAMAGE_(RESISTANCE|IMMUNITY|VULNERABILITY)_(ACID|BLUDGEONING|COLD|FIRE|FORCE|LIGHTNING|NECROTIC|PIERCING|POISON|PSYCHIC|RADIANT|SLASHING|THUNDER)(_[A-Z_]+)?$/;

/** IDs the content grants as markers on purpose, with no element behind them. */
const MARKER = /^ID_(INTERNAL|SIZE)_|_MULTICLASS|_GRANTS_|_OPTION_/;

/** IDs named in a requirement expression ("ID_A,(ID_B||!ID_C)", "[level:5]" and the like are not IDs). */
function requirementIds(req: string): string[] {
  return [...req.matchAll(/!?(ID_[A-Z0-9_]+)/g)].map((m) => m[1]);
}

export function lintContent(reg: ARegistry): LintFinding[] {
  const out: LintFinding[] = [];
  const add = (kind: string, e: AElement, detail: string) => out.push({ kind, id: e.id, name: e.name, detail });
  // A requirement may name a marker that some rule grants without an element of its own.
  const granted = new Set<string>();
  for (const e of reg.all()) for (const r of e.rules) if (r.kind === "grant" && r.id) granted.add(r.id);
  for (const e of reg.all()) {
    for (const r of e.rules) {
      if (r.kind === "grant") {
        // Marker IDs are granted on purpose without an element (conditions, sizes, multiclass and option flags):
        // other rules ask whether the character has them.
        if (!r.id) add("empty grant", e, `grants a ${r.type} without saying which${r.name ? ` ("${r.name}")` : ""}`);
        else if (!reg.get(r.id) && !MARKER.test(r.id)) add("missing grant", e, `grants ${r.type} ${r.id}, which is not in the content`);
        // Damage defense markers have a fixed shape; a misspelt one never shows on a sheet.
        else if (/^ID_INTERNAL_CONDITION_DAMAGE_/.test(r.id) && !DEFENSE.test(r.id) && !ID_TYPOS[r.id]) add("malformed marker", e, `grants ${r.id}, not a damage resistance, immunity or vulnerability`);
      } else if (r.kind === "select") {
        // A choice whose options depend on the character ("$(spellcasting:list)") is judged with a character.
        if (r.type === "List" || /\$\(/.test(r.supports)) continue;
        const options = reg.find(r.type, r.supports);
        if (!options.length) add("empty choice", e, `"${r.name}" chooses a ${r.type} from "${r.supports}", and nothing in the content matches`);
        else if (options.length < r.number) add("too few options", e, `"${r.name}" chooses ${r.number} from "${r.supports}", and only ${options.length} match`);
      }
      const req = (r as { requirements?: string }).requirements;
      if (req) for (const id of requirementIds(req)) if (!reg.get(id) && !MARKER.test(id) && !granted.has(id)) add("missing requirement", e, `a rule needs ${id}, which nothing in the content gives`);
    }
    if (e.requirements) for (const id of requirementIds(e.requirements)) if (!reg.get(id) && !MARKER.test(id) && !granted.has(id)) add("missing requirement", e, `needs ${id}, which nothing in the content gives`);
  }
  return out;
}
