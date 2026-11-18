/** The dnd5e system's keys for languages and tools, shared by the Foundry importer and exporter. */

/** Foundry's language keys that differ from the language's name. */
export const FLANG: Record<string, string> = {
  sign: "common sign language",
  deep: "deep speech",
  cant: "thieves' cant",
  thieves: "thieves' cant",
  gith: "githyanki",
  aarakocra: "auran",
};

/** Foundry's tool keys (dnd5e system): the kits and instruments by their short names. */
export const FTOOL: Record<string, string> = {
  thief: "thieves' tools",
  disg: "disguise kit",
  forg: "forgery kit",
  herb: "herbalism kit",
  navg: "navigator's tools",
  pois: "poisoner's kit",
  alchemist: "alchemist's supplies",
  brewer: "brewer's supplies",
  calligrapher: "calligrapher's supplies",
  carpenter: "carpenter's tools",
  cartographer: "cartographer's tools",
  cobbler: "cobbler's tools",
  cook: "cook's utensils",
  glassblower: "glassblower's tools",
  jeweler: "jeweler's tools",
  leatherworker: "leatherworker's tools",
  mason: "mason's tools",
  painter: "painter's supplies",
  potter: "potter's tools",
  smith: "smith's tools",
  tinker: "tinker's tools",
  weaver: "weaver's tools",
  woodcarver: "woodcarver's tools",
  chess: "dragonchess set",
  card: "playing card set",
  dice: "dice set",
  "three-dragon": "three-dragon ante set",
  bagpipes: "bagpipes",
  drum: "drum",
  dulcimer: "dulcimer",
  flute: "flute",
  horn: "horn",
  lute: "lute",
  lyre: "lyre",
  panflute: "pan flute",
  shawm: "shawm",
  viol: "viol",
  air: "vehicles (air)",
  land: "vehicles (land)",
  space: "vehicles (space)",
  water: "vehicles (water)",
};

/** A name to its dnd5e key: the reverse of a map above; otherwise the plain name lower case ("elvish"). */
const reverse = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
// Several keys read as one language (cant, thieves; aarakocra as auran): written with the standard key.
const LANG_KEY: Record<string, string> = { "common sign language": "sign", "deep speech": "deep", "thieves' cant": "cant" };
const TOOL_KEY = reverse(FTOOL);

/** dnd5e's standard language keys (dnd5e 3.x CONFIG.DND5E.languages); a language outside them goes in "custom". */
const FOUNDRY_LANGUAGES = new Set([
  "common",
  "dwarvish",
  "elvish",
  "giant",
  "gnomish",
  "goblin",
  "halfling",
  "orc",
  "abyssal",
  "celestial",
  "draconic",
  "deep",
  "infernal",
  "primordial",
  "aquan",
  "auran",
  "ignan",
  "terran",
  "sylvan",
  "undercommon",
  "druidic",
  "cant",
  "sign",
]);

export function foundryLanguageKey(name: string): string | undefined {
  const n = name.toLowerCase().trim();
  const k = LANG_KEY[n] ?? n;
  return FOUNDRY_LANGUAGES.has(k) ? k : undefined;
}

export function foundryToolKey(name: string): string | undefined {
  return TOOL_KEY[name.toLowerCase().trim()];
}
