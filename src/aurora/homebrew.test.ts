import { describe, expect, it } from "vitest";
import { loadRegistry, nodeXml } from "./fixture";
import { ARegistry } from "./registry";
import { parseElementsXml } from "./parse";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { autoFill } from "./autofill";
import { buildSheet } from "./sheet";
import { newEntry, toXml, validate, type HbEntry } from "./homebrew";

const base = loadRegistry("fixtures/content");

/** The fixture ruleset plus homebrew entries, the way the app loads them. */
function withHomebrew(entries: HbEntry[]) {
  const reg = new ARegistry();
  for (const e of base.all()) reg.addElements([e]);
  reg.addFile(parseElementsXml(toXml(entries), nodeXml));
  reg.build();
  return reg;
}

const make = (name: string, kind: HbEntry["kind"], patch: Partial<HbEntry> & { data?: HbEntry["data"] } = {}): HbEntry => {
  const e = newEntry(kind);
  return { ...e, name, ...patch, data: { ...e.data, ...(patch.data ?? {}) } };
};

describe("homebrew builder", () => {
  it("makes valid XML that the engine reads", () => {
    const entries = [
      make("Moon Blade", "weapon", { data: { damage: "1d10", damageType: "radiant", magic: "1" } }),
      make("Dusk Mail", "armor", { data: { armor: "heavy", ac: "17" } }),
      make("Star Bolt", "spell", { description: "A bolt of starlight.\n\nIt shines.", data: { level: "2", classes: "Spellsinger", concentration: true } }),
      make("Night Eyes", "feat", { description: "You see in the dark.", effects: [{ kind: "skill", target: "perception", value: 2 }] }),
    ];
    const reg = withHomebrew(entries);
    expect(reg.ofType("Weapon").some((w) => w.name === "Moon Blade")).toBe(true);
    const spell = reg.ofType("Spell").find((s) => s.name === "Star Bolt")!;
    expect(spell.setters.isConcentration.value).toBe("true");
    expect(spell.supports).toContain("Spellsinger");
    expect(spell.description).toContain("<p>It shines.</p>");
  });

  it("an equipped homebrew weapon and armor change the attack and armor class", () => {
    const sword = make("Moon Blade", "weapon", { data: { damage: "1d10", damageType: "radiant", magic: "1", properties: "finesse" } });
    const mail = make("Dusk Mail", "armor", { data: { armor: "heavy", ac: "17" } });
    const reg = withHomebrew([sword, mail]);
    const ch = autoFill({ ...newCharacter(), race: "ID_SF_RACE_EMBERKIN", background: "ID_SF_BACKGROUND_WAYFARER", classes: [{ classId: "ID_SF_CLASS_WARDEN", level: 1 }], abilityBase: { strength: 14, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 } }, reg);
    ch.inventory = [
      { uid: "w", id: sword.id, qty: 1, equipped: true, attuned: false },
      { uid: "a", id: mail.id, qty: 1, equipped: true, attuned: false },
    ];
    const sh = buildSheet(resolve(ch, reg));
    expect(sh.ac.value).toBe(17); // heavy armor ignores Dexterity
    expect(sh.attacks[0]).toMatchObject({ name: "Moon Blade", damageType: "radiant" });
    expect(sh.attacks[0].bonus).toBe(2 + 2 + 1); // Strength 14 gives +2, proficiency +2, magic +1
  });

  it("a feat's effects add to the character", () => {
    const feat = make("Night Eyes", "feat", { effects: [{ kind: "skill", target: "perception", value: 2 }, { kind: "speed", value: 5 }, { kind: "ability", target: "wisdom", value: 1 }] });
    const reg = withHomebrew([feat]);
    const ch = autoFill({ ...newCharacter(), race: "ID_SF_RACE_EMBERKIN", background: "ID_SF_BACKGROUND_WAYFARER", classes: [{ classId: "ID_SF_CLASS_WARDEN", level: 1 }], extras: [feat.id] }, reg);
    const before = resolve(autoFill({ ...newCharacter(), race: "ID_SF_RACE_EMBERKIN", background: "ID_SF_BACKGROUND_WAYFARER", classes: [{ classId: "ID_SF_CLASS_WARDEN", level: 1 }] }, reg), reg);
    const after = resolve(ch, reg);
    expect(after.stats.get("wisdom") - before.stats.get("wisdom")).toBe(1);
    expect(after.stats.get("speed") - before.stats.get("speed")).toBe(5);
    expect(after.stats.get("perception") - before.stats.get("perception")).toBe(2 + (after.stats.get("wisdom:modifier") - before.stats.get("wisdom:modifier")));
  });

  it("escapes text and refuses entries that would be useless", () => {
    expect(toXml([make('Cat & "Mouse" <1>', "item")])).toContain("Cat &amp; &quot;Mouse&quot; &lt;1&gt;");
    expect(validate(make("", "item"))).toContain("Give it a name.");
    expect(validate(make("Odd", "weapon", { data: { damage: "lots" } }))).toContain("Damage should look like 1d8.");
    expect(validate(make("Nameless Song", "spell", { data: { classes: "" } }))[0]).toMatch(/class/);
    expect(validate(make("Fine", "item"))).toEqual([]);
  });
});
