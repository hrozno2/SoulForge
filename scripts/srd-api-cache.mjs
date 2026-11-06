#!/usr/bin/env node
/**
 * Downloads the SRD API's data (dnd5eapi.co, 5e-bits, OGL 1.0a) once into <cache>/srd-api/, so the "against the SRD"
 * gate runs offline and gives the same result each time. Test data only: nothing from here ships (docs/PLAN-5ETOOLS.md,
 * D3). Monsters are left out, as the app does not check them. Run again only to refresh: `node scripts/srd-api-cache.mjs`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE = process.env.SOULFORGE_RULES ?? join(homedir(), ".soulforge-test");
const HOST = "https://www.dnd5eapi.co";
const SKIP = new Set(["monsters"]);

async function get(path) {
  for (let i = 0; ; i++) {
    const r = await fetch(HOST + path, { signal: AbortSignal.timeout(30000) }).catch((e) => ({ ok: false, status: String(e.message) }));
    if (r.ok) return r.json();
    if (r.status === 404) return null;
    if (i === 4) throw new Error(`${path}: ${r.status}`);
    await new Promise((f) => setTimeout(f, 2000 * (i + 1)));
  }
}
async function pool(items, n, fn) {
  const out = [];
  let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i]); } }));
  return out;
}

for (const edition of ["2014", "2024"]) {
  const dir = join(CACHE, "srd-api", edition);
  mkdirSync(dir, { recursive: true });
  const index = await get(`/api/${edition}`);
  const counts = {};
  for (const res of Object.keys(index)) {
    if (SKIP.has(res)) continue;
    const list = (await get(`/api/${edition}/${res}`))?.results ?? [];
    const rows = await pool(list, 4, async (x) => {
      const row = await get(x.url);
      // A class's level table is its own endpoint.
      if (res === "classes" && row) row.levels = await get(`${x.url}/levels`);
      return row;
    });
    writeFileSync(join(dir, `${res}.json`), JSON.stringify(rows.filter(Boolean), null, 1));
    counts[res] = rows.filter(Boolean).length;
  }
  writeFileSync(join(dir, "_meta.json"), JSON.stringify({ host: HOST, edition, fetched: new Date().toISOString(), licence: "data under the Open Gaming License 1.0a; test use only", counts }, null, 1));
  console.log(edition, JSON.stringify(counts));
}
