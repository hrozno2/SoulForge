/**
 * What the fuzz tests share (engineFuzz, importFuzz): a seeded random source, so a failure can be run again, and one
 * change somewhere in a JSON value: a value replaced by something nasty, a key removed, a list tripled.
 */
export const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Every place in the value: the path to it. */
export function paths(v: Json, at: (string | number)[] = [], out: (string | number)[][] = []): (string | number)[][] {
  out.push(at);
  if (Array.isArray(v)) v.forEach((x, i) => paths(x, [...at, i], out));
  else if (v && typeof v === "object") for (const k of Object.keys(v)) paths(v[k], [...at, k], out);
  return out;
}

export const NASTY: Json[] = [
  null,
  true,
  0,
  -1,
  -999999,
  30,
  1e9,
  1.5,
  Number.MAX_SAFE_INTEGER,
  "",
  "ID_DOES_NOT_EXIST",
  "__proto__",
  "constructor",
  "<script>alert(1)</script>",
  "x".repeat(5000),
  [],
  {},
  [[]],
  { level: -5 },
  ["ID_DOES_NOT_EXIST", "ID_DOES_NOT_EXIST"],
];

/** One change somewhere in the character: a value replaced, a key removed, a list doubled or emptied. */
export function mutate(ch: Json, rng: () => number): Json {
  const copy = JSON.parse(JSON.stringify(ch)) as Json;
  const all = paths(copy).filter((p) => p.length > 0);
  const path = all[Math.floor(rng() * all.length)];
  let parent = copy as never as Record<string | number, Json>;
  for (const k of path.slice(0, -1)) parent = parent[k] as never;
  const key = path[path.length - 1];
  const roll = rng();
  if (roll < 0.2 && !Array.isArray(parent)) delete parent[key];
  else if (roll < 0.3 && Array.isArray(parent[key]))
    parent[key] = [...(parent[key] as Json[]), ...(parent[key] as Json[]), ...(parent[key] as Json[])];
  else parent[key] = NASTY[Math.floor(rng() * NASTY.length)];
  return copy;
}

/**
 * The work this process has done, in milliseconds of processor time. A fuzz round's limit is against a hang (a cycle
 * walked for ever), so it is measured in work done, not in time passed: in the full check every suite runs at once
 * and a round that does a second of work can take minutes on the clock (it did on 2026-11-24, and failed the run).
 */
export const workMs = (): number => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};
