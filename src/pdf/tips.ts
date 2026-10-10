import type { Resolved } from "../aurora/engine";
import type { SheetData } from "../aurora/sheet";

export interface TipGroup {
  title: string;
  items: string[];
}

const BY_CLASS: Record<string, string[]> = {
  barbarian: ["Rage before you are hit, not after. It also resists most weapon damage, which makes it the best defence you have.", "Reckless attacks give enemies advantage against you. Use them when you are healthy or when the fight must end fast."],
  bard: ["Hand out Bardic Inspiration at the start of a scene, and keep one die for yourself.", "Your cantrips and Vicious Mockery-style options keep you useful when slots run low. Save high slots for spells that change the fight."],
  cleric: ["Healing in combat is rarely the best use of an action. Heal people who are at 0 HP, and spend other turns on buffs, control and damage.", "Check your domain features and Channel Divinity at the start of each fight."],
  druid: ["Wild Shape is a pool of extra hit points as well as a disguise. Use it when you need a safe tank or a scout.", "Concentration spells are your strongest tools. Stay out of reach so you keep them."],
  fighter: ["Action Surge gives you a second action, not a second attack action only. Spells, dashes and potions count.", "Second Wind is a bonus action. Use it early in a fight, since it comes back on a short rest."],
  monk: ["Ki points come back on a short rest. Spend them freely, and ask for a short rest when the party is low.", "Move before and after you attack. Stunning Strike is strongest against one big enemy."],
  paladin: ["Divine Smite works on a hit you already made, so you can decide after you see the roll. Smiting on a critical hit is the best use.", "Your aura only works when you are close. Stay near the people it protects."],
  ranger: ["Know your favoured foes and terrain. Tell the table what you want to track and forage for during travel.", "Concentration on Hunter's Mark is worth it in long fights. Move it when its target drops."],
  rogue: ["Sneak Attack needs advantage or an ally next to the target, once per turn. It can also trigger on someone else's turn with a reaction attack.", "Cunning Action lets you disengage or hide as a bonus action. Fight, then step out of reach."],
  sorcerer: ["Metamagic costs sorcery points that come back on a long rest. Plan a few uses per day rather than spending them all early.", "You know few spells. Choose ones that stay useful at every level."],
  warlock: ["Pact slots come back on a short rest. Ask for one whenever the party can take it.", "Eldritch Blast is your best attack at every level. Invocations that improve it are strong picks."],
  wizard: ["Your spellbook holds more spells than you can prepare. Change the prepared list after each long rest to match what you expect to face.", "Ritual casting lets you cast some spells without a slot if you take ten extra minutes."],
  artificer: ["Infusions and your tools do a lot of work out of combat. Keep a list of what you have infused.", "Your spell list is built for support and utility. Look at what the party lacks."],
};

const GENERAL: TipGroup[] = [
  {
    title: "On your turn",
    items: [
      "You get one action, one bonus action, movement, one free object interaction, and one reaction per round.",
      "Common actions: Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object.",
      "You can split your movement before and after an action. Moving away from an enemy that is next to you can provoke an opportunity attack unless you Disengage.",
      "Say what you want to do, and let the DM tell you what to roll. Describing the goal usually works better than naming a skill.",
    ],
  },
  {
    title: "Dice",
    items: [
      "Advantage: roll two d20 and take the higher. Disadvantage: take the lower. They cancel each other out, however many of each you have.",
      "Check, save, or attack: d20 plus the bonus on your sheet. Proficiency is already included in the numbers shown.",
      "A natural 20 on an attack is a critical hit: roll the damage dice twice. A natural 1 always misses.",
    ],
  },
  {
    title: "Hit points and resting",
    items: [
      "At 0 hit points you fall unconscious and make a death saving throw each turn: 10 or higher is a success, three successes stabilise you, three failures kill you. A 20 brings you back with 1 HP.",
      "A short rest is at least one hour. You can spend Hit Dice to heal. A long rest is at least eight hours and restores all hit points and half your Hit Dice.",
      "Take a short rest when the party has spent resources, and a long rest when it is safe. Ask the DM what is possible before a big fight.",
    ],
  },
  {
    title: "Teamwork",
    items: [
      "Help gives an ally advantage on their next check or attack. It is often the best action you have when you cannot do much.",
      "Tell the party what you plan on your turn before the dice, so allies can set up flanks, buffs and area spells.",
      "Keep notes on names, places and promises. The DM will bring them back.",
    ],
  },
];

/** Tips and tricks for play: general reminders, then ones that fit this character. */
export function playTips(r: Resolved, sh: SheetData): TipGroup[] {
  const out: TipGroup[] = [];
  const mine: string[] = [];
  const classNames = r.character.classes.map((c) => (r.reg.get(c.classId)?.name ?? "").toLowerCase());
  for (const n of classNames) {
    const tips = BY_CLASS[n];
    if (tips) mine.push(...tips);
  }
  const casting = sh.casting[0];
  if (casting) {
    mine.push(
      `Your spell save DC is ${casting.dc} and your spell attack bonus is ${casting.attack >= 0 ? "+" : ""}${casting.attack}. Spells that name a saving throw use the DC; spells that need an attack roll use the bonus.`,
      "You can hold concentration on one spell at a time. Taking damage forces a Constitution save (DC 10 or half the damage, whichever is higher) to keep it.",
      "Casting a spell as a bonus action limits your other spells that turn to cantrips. Plan which one you want.",
    );
  }
  const limited = sh.features.filter((f) => f.usage && /\/\s*(short|long)/i.test(f.usage)).slice(0, 6);
  if (limited.length) mine.push(`Features to track: ${limited.map((f) => `${f.name} (${f.usage})`).join("; ")}.`);
  const ac = sh.ac.value;
  mine.push(`Your armor class is ${ac}. Attacks that roll lower than that miss you.`);
  if (mine.length) out.push({ title: `For ${r.character.name || "this character"}`, items: mine });
  return [...out, ...GENERAL];
}
