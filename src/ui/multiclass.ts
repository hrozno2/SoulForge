import type { Resolved } from "../aurora/engine";
import { reqCtx } from "../aurora/engine";
import { explainUnmet } from "../aurora/requirements";
import type { AElement } from "../aurora/types";

/**
 * Why a character cannot multiclass into a class yet, or undefined when it can.
 * The new class's own prerequisite comes first; then each class the character already has must also allow it.
 */
export function multiclassLock(r: Resolved, cls: AElement): string | undefined {
  if (!r.character.classes.length) return undefined;
  const ctx = reqCtx(r);
  const nameOf = (id: string) => r.reg.get(id)?.name;
  const own = cls.multiclass && explainUnmet(cls.multiclass.requirements, ctx, nameOf);
  if (own) return cls.multiclass?.prerequisite ? `${own} (${cls.multiclass.prerequisite})` : own;
  for (const c of r.character.classes) {
    const el = r.reg.get(c.classId);
    const why = el?.multiclass && explainUnmet(el.multiclass.requirements, ctx, nameOf);
    if (why) return `Your ${el!.name}: ${why.charAt(0).toLowerCase()}${why.slice(1)}`;
  }
  return undefined;
}
