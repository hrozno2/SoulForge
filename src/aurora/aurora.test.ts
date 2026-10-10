import { describe, expect, it } from "vitest";
import { nodeXml } from "./fixture";
import { parseElementsXml, parseIndexXml } from "./parse";
import { meets, type ReqCtx } from "./requirements";
import { ARegistry, matchesSupports } from "./registry";
import { resolve } from "./engine";
import { autoFill } from "./autofill";
import { buildSheet } from "./sheet";
import { newCharacter } from "./character";
import { crawlIndex, flatten, syncFiles, type FileCache } from "./sources";

const SAMPLE = `<?xml version="1.0"?>
<elements>
  <info><name>Test</name><update version="1.2.3"><file name="t.xml" url="x"/></update></info>
  <element name="Dwarf" type="Race" source="Test" id="ID_RACE_DWARF">
    <description><p>Sturdy.</p></description>
    <rules>
      <stat name="innate speed" value="25" bonus="base" />
      <stat name="constitution" value="2" />
      <select type="Language" name="Language" supports="Standard" />
      <grant type="Racial Trait" id="ID_TRAIT_TOUGH" level="3" />
    </rules>
  </element>
  <element name="Tough" type="Racial Trait" source="Test" id="ID_TRAIT_TOUGH"><rules><stat name="hp" value="level" /></rules></element>
  <element name="Common" type="Language" source="Test" id="ID_LANG_COMMON"><supports>Standard</supports></element>
  <element name="Elvish" type="Language" source="Test" id="ID_LANG_ELVISH"><supports>Standard</supports></element>
  <element name="Draconic" type="Language" source="Test" id="ID_LANG_DRACONIC"><supports>Exotic</supports></element>
  <element name="Fighter" type="Class" source="Test" id="ID_CLASS_FIGHTER">
    <setters><set name="hd">d10</set></setters>
    <rules>
      <grant type="Proficiency" id="ID_PROF_SAVE_STR" requirements="!ID_MULTICLASS_FIGHTER" />
      <stat name="level-bonus" value="level:fighter" level="2" />
      <select type="Archetype" name="Martial Archetype" supports="Fighter Subclass" level="3" />
    </rules>
    <multiclass id="ID_MULTICLASS_FIGHTER"><requirements>[str:13]</requirements><rules><grant type="Grants" id="ID_INTERNAL_GRANT_MULTICLASS" /></rules></multiclass>
  </element>
  <element name="Wizard" type="Class" source="Test" id="ID_CLASS_WIZARD">
    <setters><set name="hd">d6</set></setters>
    <multiclass id="ID_MULTICLASS_WIZARD"><rules><grant type="Grants" id="ID_INTERNAL_GRANT_MULTICLASS" /></rules></multiclass>
  </element>
  <element name="Str save" type="Proficiency" source="Test" id="ID_PROF_SAVE_STR"><rules><stat name="strength:save:proficiency" value="proficiency" bonus="proficiency" /></rules></element>
  <element name="Champion" type="Archetype" source="Test" id="ID_ARCH_CHAMPION"><supports>Fighter Subclass</supports><rules><stat name="ac:misc" value="1" /></rules></element>
  <element name="Ring A" type="Item" source="Test" id="ID_RING_A"><rules><stat name="ac:misc" value="1" bonus="ring" /></rules></element>
  <element name="Ring B" type="Item" source="Test" id="ID_RING_B"><rules><stat name="ac:misc" value="2" bonus="ring" /></rules></element>
  <append id="ID_CLASS_FIGHTER"><rules><stat name="appended" value="7" /></rules></append>
</elements>`;

function reg(xml = SAMPLE) {
  const r = new ARegistry();
  r.addFile(parseElementsXml(xml, nodeXml));
  r.build();
  return r;
}

describe("parser", () => {
  it("reads elements, rules, setters and info", () => {
    const f = parseElementsXml(SAMPLE, nodeXml);
    expect(f.version).toBe("1.2.3");
    const dwarf = f.elements.find((e) => e.id === "ID_RACE_DWARF")!;
    expect(dwarf.rules).toHaveLength(4);
    expect(dwarf.description).toContain("Sturdy");
    expect(f.elements.find((e) => e.id === "ID_CLASS_FIGHTER")!.setters.hd.value).toBe("d10");
    expect(f.appends[0].id).toBe("ID_CLASS_FIGHTER");
  });
  it("rejects broken xml", () => {
    expect(() => parseElementsXml("<elements><element", nodeXml)).toThrow();
  });
  it("reads an index and ignores obsolete entries", () => {
    const idx = parseIndexXml(
      `<index><info><name>X</name><update version="0.3"/></info><files><file name="a.xml" url="u/a.xml"/><obsolete name="b" url="u/b"/></files></index>`,
      nodeXml,
    );
    expect(idx.version).toBe("0.3");
    expect(idx.files.map((f) => f.url)).toEqual(["u/a.xml"]);
  });
});

describe("requirements and supports", () => {
  const ctx: ReqCtx = {
    hasId: (id) => ["ID_A", "ID_B"].includes(id),
    hasType: (t) => t === "spell",
    level: 5,
    stat: (n) => ({ strength: 14, dexterity: 10 })[n] ?? 0,
  };
  it("evaluates AND, OR, NOT and ability pairs", () => {
    expect(meets("", ctx)).toBe(true);
    expect(meets("ID_A,ID_B", ctx)).toBe(true);
    expect(meets("ID_A&&ID_C", ctx)).toBe(false);
    expect(meets("ID_C||ID_B", ctx)).toBe(true);
    expect(meets("!ID_C", ctx)).toBe(true);
    expect(meets("([str:13]||[dex:13]),(ID_A||ID_Z)", ctx)).toBe(true);
    expect(meets("[dex:13]", ctx)).toBe(false);
    expect(meets("[level:5]", ctx)).toBe(true);
    expect(meets("[level:6]", ctx)).toBe(false);
    expect(meets("[type:spell]", ctx)).toBe(true);
  });
  it("matches supports filters", () => {
    const r = reg();
    const common = r.get("ID_LANG_COMMON")!;
    expect(matchesSupports(common, "Standard")).toBe(true);
    expect(matchesSupports(common, "Standard,Exotic")).toBe(false);
    expect(matchesSupports(common, "Exotic||Standard")).toBe(true);
    expect(matchesSupports(common, "ID_LANG_ELVISH|ID_LANG_COMMON")).toBe(true);
  });
});

describe("registry", () => {
  it("applies append and later overrides", () => {
    const r = reg();
    expect(r.get("ID_CLASS_FIGHTER")!.rules.some((x) => x.kind === "stat" && x.name === "appended")).toBe(true);
    const r2 = new ARegistry();
    r2.addFile(parseElementsXml(SAMPLE, nodeXml));
    r2.addFile(parseElementsXml(`<elements><element name="Dwarf 2" type="Race" source="x" id="ID_RACE_DWARF"/></elements>`, nodeXml));
    r2.build();
    expect(r2.get("ID_RACE_DWARF")!.name).toBe("Dwarf 2");
  });
});

describe("engine", () => {
  const r = reg();
  const base = () => {
    const ch = newCharacter();
    ch.abilityBase = { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 };
    return ch;
  };

  it("applies stats, level gating and bonus groups", () => {
    const ch = base();
    ch.race = "ID_RACE_DWARF";
    ch.classes = [{ classId: "ID_CLASS_FIGHTER", level: 3 }];
    const res = resolve(ch, r);
    expect(res.stats.get("constitution")).toBe(16);
    expect(res.stats.get("innate speed")).toBe(25);
    expect(res.stats.get("hp")).toBe(10 + 3 + 2 * (6 + 3) + 3); // fighter 3: 13 + 18, plus Tough = level
    expect(res.stats.get("level-bonus")).toBe(3);
    expect(res.stats.get("appended")).toBe(7);
    expect(res.stats.get("strength:save")).toBe(2 + 2);
  });

  it("offers selects filtered by supports and respects choices", () => {
    const ch = base();
    ch.race = "ID_RACE_DWARF";
    let res = resolve(ch, r);
    const lang = res.slots.find((s) => s.rule.type === "Language")!;
    expect(lang.options.map((o) => o.name).sort()).toEqual(["Common", "Elvish"]);
    ch.selections[lang.key] = ["ID_LANG_ELVISH"];
    res = resolve(ch, r);
    expect(res.ids.has("ID_LANG_ELVISH")).toBe(true);
    expect(buildSheet(res).proficiencies.languages).toEqual(["Elvish"]);
  });

  it("only offers level-gated selects once the level is reached", () => {
    const ch = base();
    ch.classes = [{ classId: "ID_CLASS_FIGHTER", level: 2 }];
    expect(resolve(ch, r).slots.some((s) => s.rule.name === "Martial Archetype")).toBe(false);
    ch.classes = [{ classId: "ID_CLASS_FIGHTER", level: 3 }];
    const res = resolve(ch, r);
    const slot = res.slots.find((s) => s.rule.name === "Martial Archetype")!;
    expect(slot.options.map((o) => o.id)).toEqual(["ID_ARCH_CHAMPION"]);
  });

  it("uses multiclass requirements: a second class skips first-class proficiencies", () => {
    const ch = base();
    ch.classes = [{ classId: "ID_CLASS_WIZARD", level: 1 }, { classId: "ID_CLASS_FIGHTER", level: 1 }];
    const res = resolve(ch, r);
    expect(res.ids.has("ID_PROF_SAVE_STR")).toBe(false);
    expect(res.ids.has("ID_INTERNAL_GRANT_MULTICLASS")).toBe(true);
    const first = base();
    first.classes = [{ classId: "ID_CLASS_FIGHTER", level: 1 }];
    expect(resolve(first, r).ids.has("ID_PROF_SAVE_STR")).toBe(true);
  });

  it("takes the best of each bonus type and sums the rest", () => {
    const ch = base();
    ch.classes = [{ classId: "ID_CLASS_FIGHTER", level: 3 }];
    ch.inventory = [
      { uid: "1", id: "ID_RING_A", qty: 1, equipped: true, attuned: true },
      { uid: "2", id: "ID_RING_B", qty: 1, equipped: true, attuned: true },
    ];
    // ring bonuses do not stack (best is +2), plus the Champion +1 once picked
    const open = resolve(ch, r).slots.find((s) => s.rule.name === "Martial Archetype")!;
    ch.selections[open.key] = ["ID_ARCH_CHAMPION"];
    expect(resolve(ch, r).stats.get("ac:misc")).toBe(3);
  });

  it("autoFill completes every open choice", () => {
    const ch = base();
    ch.race = "ID_RACE_DWARF";
    ch.classes = [{ classId: "ID_CLASS_FIGHTER", level: 3 }];
    const done = autoFill(ch, r);
    const res = resolve(done, r);
    expect(res.slots.filter((s) => s.chosen.length < s.rule.number)).toEqual([]);
  });
});

describe("content links", () => {
  const files: Record<string, string> = {
    "https://x/root.index": `<index><info><name>Root</name><update version="1"/></info><files><file name="a.index" url="https://x/a.index"/><file name="b.index" url="https://x/b.index"/></files></index>`,
    "https://x/a.index": `<index><info><name>A</name><update version="1"/></info><files><file name="a1.xml" url="https://x/a1.xml"/></files></index>`,
    "https://x/b.index": `<index><info><name>B</name><update version="1"/></info><files><file name="b1.xml" url="https://x/b1.xml"/><file name="b2.xml" url="https://x/b2.xml"/></files></index>`,
    "https://x/a1.xml": "A1", "https://x/b1.xml": "B1", "https://x/b2.xml": "B2",
  };
  const calls: string[] = [];
  const fetchText = async (u: string) => {
    calls.push(u);
    if (!(u in files)) throw new Error("404");
    return files[u];
  };
  const memory = (): FileCache & { store: Map<string, string> } => {
    const store = new Map<string, string>();
    return {
      store,
      get: async (u) => store.get(u),
      put: async (u, t) => void store.set(u, t),
      keys: async () => [...store.keys()],
      remove: async (u) => void store.delete(u),
    };
  };

  it("crawls nested indexes in order", async () => {
    const tree = await crawlIndex("https://x/root.index", fetchText, nodeXml);
    expect(flatten(tree, new Set()).map((n) => n.name)).toEqual(["Root", "A", "B"]);
    expect(flatten(tree, new Set(["https://x/a.index"])).map((n) => n.name)).toEqual(["Root", "B"]);
  });

  it("downloads once, then only what changed", async () => {
    const cache = memory();
    const tree1 = await crawlIndex("https://x/root.index", fetchText, nodeXml);
    const first = await syncFiles({ root: tree1, disabled: [], previousVersions: {}, cache, fetchText });
    expect(first.downloaded).toBe(3);

    calls.length = 0;
    const second = await syncFiles({ root: tree1, disabled: [], previousVersions: first.versions, cache, fetchText });
    expect(second.downloaded).toBe(0);
    expect(second.reused).toBe(3);
    expect(calls).toEqual([]);

    // index B gets a new version and a changed file
    files["https://x/b.index"] = files["https://x/b.index"].replace('version="1"', 'version="2"');
    files["https://x/b1.xml"] = "B1-new";
    const tree2 = await crawlIndex("https://x/root.index", fetchText, nodeXml);
    calls.length = 0;
    const third = await syncFiles({ root: tree2, disabled: [], previousVersions: second.versions, cache, fetchText });
    expect(third.changed).toEqual(["https://x/b.index"]);
    expect(calls.sort()).toEqual(["https://x/b1.xml", "https://x/b2.xml"]);
    expect(cache.store.get("https://x/b1.xml")).toBe("B1-new");
  });

  it("drops files that left the index and tolerates a failing file", async () => {
    const cache = memory();
    cache.store.set("https://x/old.xml", "old");
    files["https://x/b2.xml"] = "B2";
    const tree = await crawlIndex("https://x/root.index", fetchText, nodeXml);
    const bad = { ...tree, children: tree.children.map((c) => ({ ...c, files: [...c.files, "https://x/missing.xml"] })) };
    const res = await syncFiles({ root: bad, disabled: [], previousVersions: {}, cache, fetchText });
    expect(res.failed).toEqual(["https://x/missing.xml"]);
    expect(cache.store.has("https://x/old.xml")).toBe(false);
    expect(cache.store.has("https://x/a1.xml")).toBe(true);
  });
});
