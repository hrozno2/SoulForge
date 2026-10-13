/**
 * Builds people play, from forums and play data: the most common multiclasses on D&D Beyond (Fighter/Rogue,
 * Paladin with Sorcerer, Warlock or Bard), well-known optimized builds, and character ideas from EN World and
 * ArtificialTwenty threads (a polearm "Dragoon", a tome Warlock gunslinger, a skills expert, a Lizardfolk wizard).
 * The rules tests build each one and check it.
 */
import type { ARegistry } from "./registry";
import type { AElement } from "./types";
import type { Character } from "./character";
import { randomCharacter } from "./randomCharacter";

interface BuildSpec {
  name: string;
  edition: "2014" | "2024";
  species: string;
  background: string;
  classes: [string, number][];
  prefer: string[];
}

const SPECS: BuildSpec[] = [
  { name: "Fighter/Rogue skirmisher", edition: "2014", species: "Elf", background: "Soldier", classes: [["Fighter", 5], ["Rogue", 3]], prefer: ["Battle Master", "Thief", "Archery", "Wood Elf"] },
  { name: "Sorcadin", edition: "2024", species: "Dragonborn", background: "Noble", classes: [["Paladin", 6], ["Sorcerer", 2]], prefer: ["Oath of Vengeance", "Dueling", "Great Weapon Fighting"] },
  { name: "Hexadin", edition: "2014", species: "Half-Elf", background: "Noble", classes: [["Paladin", 6], ["Warlock", 2]], prefer: ["Oath of Devotion", "The Hexblade", "Hexblade", "Defense"] },
  { name: "Bardadin with Armor of Agathys", edition: "2024", species: "Human", background: "Entertainer", classes: [["Paladin", 6], ["Bard", 6]], prefer: ["Oath of Glory", "College of Valor", "Armor of Agathys"] },
  { name: "Coffeelock", edition: "2014", species: "Tiefling", background: "Sage", classes: [["Sorcerer", 6], ["Warlock", 2]], prefer: ["Draconic Bloodline", "The Fiend", "Agonizing Blast", "Eldritch Blast"] },
  { name: "Gloom Stalker assassin", edition: "2014", species: "Elf", background: "Outlander", classes: [["Ranger", 5], ["Rogue", 3]], prefer: ["Gloom Stalker", "Assassin", "Archery", "Sharpshooter", "Wood Elf"] },
  { name: "Bear Totem brawler", edition: "2014", species: "Half-Orc", background: "Folk Hero", classes: [["Barbarian", 10]], prefer: ["Path of the Totem Warrior", "Bear", "Tavern Brawler"] },
  { name: "Polearm Dragoon", edition: "2014", species: "Human", background: "Soldier", classes: [["Fighter", 10]], prefer: ["Champion", "Polearm Master", "Great Weapon Fighting", "Variant Human"] },
  { name: "Tome warlock gunslinger", edition: "2014", species: "Human", background: "Haunted One", classes: [["Warlock", 10]], prefer: ["The Great Old One", "Pact of the Tome", "Eldritch Blast", "Agonizing Blast"] },
  { name: "Skills expert", edition: "2024", species: "Human", background: "Sage", classes: [["Bard", 6], ["Rogue", 2]], prefer: ["College of Lore", "Skilled"] },
  { name: "Dhampir swashbuckler bard", edition: "2014", species: "Dhampir", background: "Sailor", classes: [["Rogue", 5], ["Bard", 3]], prefer: ["Swashbuckler", "College of Swords"] },
  { name: "Lizardfolk necromancer", edition: "2014", species: "Lizardfolk", background: "Hermit", classes: [["Wizard", 7]], prefer: ["School of Necromancy"] },
  { name: "Four Elements monk", edition: "2014", species: "Halfling", background: "Guild Artisan", classes: [["Monk", 6]], prefer: ["Way of the Four Elements"] },
  { name: "Paladin outlaw", edition: "2024", species: "Tiefling", background: "Criminal", classes: [["Paladin", 5]], prefer: ["Oath of Vengeance"] },
  { name: "Folk hero warlock", edition: "2014", species: "Halfling", background: "Folk Hero", classes: [["Warlock", 4]], prefer: ["The Archfey", "Pact of the Chain"] },
  { name: "Cantrip collector", edition: "2014", species: "Half-Elf", background: "Acolyte", classes: [["Warlock", 3], ["Druid", 2], ["Cleric", 1]], prefer: ["War Caster", "Shillelagh", "Booming Blade"] },
  { name: "Moon druid", edition: "2024", species: "Elf", background: "Guide", classes: [["Druid", 8]], prefer: ["Circle of the Moon"] },
  { name: "Evoker at 20", edition: "2024", species: "Gnome", background: "Sage", classes: [["Wizard", 20]], prefer: ["Evoker", "School of Evocation"] },
  { name: "Grappler", edition: "2024", species: "Goliath", background: "Soldier", classes: [["Fighter", 4], ["Barbarian", 2]], prefer: ["Grappler", "Battle Master", "Path of the Berserker"] },
  { name: "Life cleric healer", edition: "2024", species: "Dwarf", background: "Acolyte", classes: [["Cleric", 12]], prefer: ["Life Domain", "Healer"] },
];

const modern = (e: AElement) => /PHB24|XPHB|2024/i.test(`${e.id} ${e.source}`);
const find = (reg: ARegistry, type: string, name: string, edition: "2014" | "2024") => {
  const all = reg.ofType(type).filter((e) => e.name.toLowerCase() === name.toLowerCase() && !/unearthed|playtest/i.test(e.source));
  return all.find((e) => modern(e) === (edition === "2024")) ?? all[0];
};

export const BUILDS = SPECS.map((s) => ({
  name: s.name,
  build: (reg: ARegistry, rng: () => number): Character | string => {
    const classes = s.classes.map(([n, l]) => ({ el: find(reg, "Class", n, s.edition), level: l }));
    const missing = classes.find((c) => !c.el);
    if (missing) return `class ${s.classes[classes.indexOf(missing)][0]} not found`;
    const species = find(reg, "Race", s.species, s.edition);
    const background = find(reg, "Background", s.background, s.edition);
    if (!species) return `species ${s.species} not found`;
    if (!background) return `background ${s.background} not found`;
    const total = classes.reduce((t, c) => t + c.level, 0);
    const ch = randomCharacter(reg, total, { legacy: true, playtest: false, unusual: true }, rng, {
      classId: classes[0].el!.id,
      raceId: species.id,
      backgroundId: background.id,
      multiclass: classes[1] ? { classId: classes[1].el!.id, level: classes[1].level } : undefined,
      more: classes.slice(2).map((c) => ({ classId: c.el!.id, level: c.level })),
      prefer: s.prefer,
    });
    ch.name = s.name;
    return ch;
  },
}));
