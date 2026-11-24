/**
 * The senses line of the sheet. A character can come by a sense twice (a Ranger's Feral Senses and the Blind Fighting
 * style both give blindsight; two species traits both give darkvision): the rules give one sense at its longest
 * range, not two, so the sheet says it once.
 */
const SENSE = /^(darkvision|blindsight|tremorsense|truesight)\b/i;

export interface SenseSource {
  /** The Vision element's name: "Darkvision", "Blindsight (10 ft.)", or something that is no ranged sense. */
  name: string;
}

/**
 * One line per sense, in the order first met, each at the longest range any source gives it. `rangeOf` is the
 * statistic's range for a sense ("darkvision" -> 60), which already counts every source and bonus; without one, the
 * range a name states is used. Anything that is not one of the ranged senses is listed once, by its name.
 */
export function senseLines(sources: readonly SenseSource[], rangeOf: (sense: string) => number): string[] {
  const best = new Map<string, number>();
  const order: string[] = [];
  for (const s of sources) {
    const sense = SENSE.exec(s.name)?.[1]?.toLowerCase();
    const ft = sense ? rangeOf(sense) || Number(/\((\d+) ?(?:ft|feet)\.?\)/i.exec(s.name)?.[1] ?? 0) : 0;
    const key = sense && ft > 0 ? sense : `=${s.name}`;
    if (!best.has(key)) order.push(key);
    best.set(key, Math.max(best.get(key) ?? 0, ft));
  }
  return order.map((key) => (key.startsWith("=") ? key.slice(1) : `${key.charAt(0).toUpperCase()}${key.slice(1)} ${best.get(key)} ft`));
}
