/**
 * A batch of random characters that differ as much as possible: every one a different class, species and
 * background, levels spread from 1 to 20, both rule sets, some multiclassed, some with rolled hit points, other
 * starting gear, optional rules or a companion. Used by the testing tools and the rules tests.
 */
import { isModern } from "./edition";
import { randomCharacter } from "./randomCharacter";
import type { Character } from "./character";
import type { ContentFilters } from "./books";
import { BookIndex, hiddenBy } from "./books";
import type { ARegistry } from "./registry";
import type { AElement } from "./types";
import { resolve } from "./engine";
import { multiclassLockFor } from "./multiclassLock";

const LEVEL_BANDS = [[1, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 14], [15, 17], [18, 19], [20, 20]];

export function randomBatch(reg: ARegistry, count: number, filters: ContentFilters, rng: () => number = Math.random): Character[] {
  const books = new BookIndex(reg);
  const shown = (e: AElement) => !e.compendiumHidden && !/^custom\b/i.test(e.name) && !hiddenBy(books.info(e.source), e.source, filters, e.type, e.supports);
  const shuffle = <T,>(a: T[]) => a.map((x) => [rng(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);
  const classes = shuffle(reg.ofType("Class").filter(shown));
  // One per class name first (a 2014 and a 2024 Fighter are the same class), then the rest.
  const byName = new Map<string, AElement[]>();
  for (const c of classes) (byName.get(c.name) ?? byName.set(c.name, []).get(c.name)!).push(c);
  const order = [...byName.values()].map((v) => v[0]).concat([...byName.values()].flatMap((v) => v.slice(1)));
  const races = shuffle(reg.ofType("Race").filter(shown));
  const backgrounds = shuffle(reg.ofType("Background").filter(shown));
  const modernBackgrounds = backgrounds.filter((b) => isModern(b));
  const options = reg.ofType("Option").filter(shown);
  const bands = shuffle(LEVEL_BANDS);
  const out: Character[] = [];
  for (let i = 0; i < count; i++) {
    const cls = order[i % order.length];
    const [lo, hi] = bands[i % bands.length];
    const level = lo + Math.floor(rng() * (hi - lo + 1));
    // About a third of those at level 4 or more take a second class whose requirements the array can meet.
    let multiclass: { classId: string; level: number } | undefined;
    if (level >= 4 && rng() < 0.35) {
      const other = shuffle(order.filter((c) => c.name !== cls.name && (c.source === cls.source || rng() < 0.3)))[0];
      if (other) multiclass = { classId: other.id, level: 1 + Math.floor(rng() * Math.min(5, level - 2)) };
    }
    let ch = randomCharacter(reg, level, filters, rng, {
      classId: cls.id,
      raceId: races[i % races.length]?.id,
      // A 2024 species gives no ability increase: its background is a 2024 one, where the increases are.
      backgroundId: (isModern(races[i % races.length]) && modernBackgrounds.length ? modernBackgrounds[i % modernBackgrounds.length] : backgrounds[i % backgrounds.length])?.id,
      multiclass,
      randomGear: true,
      options: options.length && rng() < 0.25 ? [options[Math.floor(rng() * options.length)].id] : [],
      companion: rng() < 0.25,
      rollHp: rng() < 0.3,
    });
    // A second class the scores cannot support is dropped rather than kept against the rules.
    if (multiclass && ch.classes.length > 1 && multiclassLockFor(resolve(ch, reg), ch.classes[1].classId)) {
      ch = randomCharacter(reg, level, filters, rng, { classId: cls.id, raceId: ch.race, backgroundId: ch.background, randomGear: true });
    }
    ch.name = `Test ${i + 1}: ${reg.get(cls.id)?.name} ${level}`;
    out.push(ch);
  }
  return out;
}
