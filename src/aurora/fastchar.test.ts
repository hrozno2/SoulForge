/**
 * The FastCharacter run (RULES_TIER=fastchar): characters made at fastcharacter.com (2024 rules), saved as text in
 * <cache>/fastcharacter/raw, imported into Soul Forge, checked against the rules, and their numbers compared with
 * FastCharacter's. The report, <cache>/fastcharacter/report.md, lists every difference by kind so each can be
 * classed as a Soul Forge bug, a FastCharacter mistake or a rules question.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { importFastCharacter } from "./foreign";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { checkCharacter, type RefClass } from "./rulesCheck";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

it.skipIf(!C || process.env.RULES_TIER !== "fastchar")(
  "FastCharacter characters, rebuilt and compared",
  () => {
    const dir = join(C!, "fastcharacter", "raw");
    if (!existsSync(dir)) return;
    const reg = loadTestContent(C!);
    const ref: RefClass[] = JSON.parse(readFileSync(join(C!, "rules-ref.json"), "utf8"));
    const out: string[] = ["# FastCharacter run", ""];
    const kinds = new Map<string, number>();
    const count = (k: string) => kinds.set(k, (kinds.get(k) ?? 0) + 1);
    for (const f of readdirSync(dir)
      .filter((x) => x.endsWith(".txt"))
      .sort()) {
      const text = readFileSync(join(dir, f), "utf8");
      const title = /^Fast Character \| (.+?) \|/m.exec(text)?.[1] ?? f;
      const res = importFastCharacter(text, reg);
      const r = resolve(res.character, reg);
      const findings = checkCharacter(r, buildSheet(r), ref);
      out.push(`## ${f}: ${title}`);
      // W9: differences that are FastCharacter's own slips, each with its evidence; the rest is counted and gated.
      const sh = buildSheet(r);
      const wis = sh.abilities.find((a) => a.id === "wisdom")?.mod ?? 0;
      const names = new Set(r.active.map((a) => a.el.name.toLowerCase().replace(/^level \d+: /, "")));
      const skillOpen = res.todo.some((t) => /skill|expertise|primal knowledge|proficiency/i.test(t));
      const explain = (d: string): string | undefined => {
        const m = /^([A-Za-z ]+): the file says (-?\d+), Soul Forge works out (-?\d+)$/.exec(d);
        const skill = m && sh.skills.find((k) => k.name.toLowerCase() === m[1].toLowerCase());
        // 2024 Divine Order Thaumaturge (Arcana, Religion) and Primal Order Magician (Arcana, Nature): Wisdom added.
        if (skill && Number(m![3]) - Number(m![2]) === wis && wis > 0) {
          if (names.has("thaumaturge") && /^(arcana|religion)$/i.test(skill.name))
            return "FastCharacter states Thaumaturge's bonus and does not add it";
          if (names.has("magician") && /^(arcana|nature)$/i.test(skill.name))
            return "FastCharacter states Magician's bonus and does not add it";
        }
        // A Cloak or Ring of Protection worn because the file's armor class counts it: its +1 to every saving throw,
        // which the file leaves out of its saves.
        const save = /^\w+ saving throw: the file says (-?\d+), Soul Forge works out (-?\d+)$/.exec(d);
        const worn = res.notes.filter((n) => /^(Cloak|Ring) of Protection: worn and attuned/.test(n)).length;
        if (save && worn && Number(save[2]) - Number(save[1]) === worn)
          return "FastCharacter counts the Cloak or Ring of Protection in armor class but not in saving throws";
        // A Monk of 14th level: Disciplined Survivor (2014: Diamond Soul), proficiency in every saving throw.
        const allSaves = names.has("disciplined survivor") || names.has("diamond soul");
        if (
          allSaves &&
          (save ? Number(save[2]) - Number(save[1]) === sh.proficiency : /saving throw: the file is not proficient, Soul Forge is$/.test(d))
        )
          return "FastCharacter leaves out Disciplined Survivor's (Diamond Soul's) proficiency in every saving throw";
        // 2024 Jack of All Trades adds to checks that use a skill; initiative uses none (PHB 2024, Bard; RULES-DECISIONS).
        const init = /^Initiative: the file says (-?\d+), Soul Forge works out (-?\d+)$/.exec(d);
        if (init && names.has("jack of all trades") && Number(init[1]) - Number(init[2]) === Math.floor(sh.proficiency / 2))
          return "FastCharacter adds the 2024 Jack of All Trades to initiative, which is not a check that uses a skill";
        // An attack line for a weapon the file's own gear does not list.
        const atk = /^(.+) attack: in the file, not on the Soul Forge sheet$/.exec(d);
        const gear = (text.split(/EQUIPMENT & TREASURE/i)[1] ?? "").toLowerCase();
        const weapon = atk?.[1].replace(/^\+\d\s*(magic\s*)?/i, "").toLowerCase();
        if (weapon && gear && !gear.includes(weapon)) return "FastCharacter gives an attack for a weapon its gear does not list";
        // An attack line both sheets have, judged by what Soul Forge's line rests on.
        const atkDiff = /^(.+) attack: the file says (-?\d+), Soul Forge works out (-?\d+)$/.exec(d);
        if (atkDiff) {
          const fileB = Number(atkDiff[2]),
            ours = Number(atkDiff[3]);
          const bare = atkDiff[1].replace(/^\+\d\s*(magic\s*)?/i, "").toLowerCase();
          const line = sh.attacksCarried.find((a) => a.name.toLowerCase().replace(/\s*\+\d$/, "") === bare);
          const mod = (id: string) => sh.abilities.find((a) => a.id === id)!.mod;
          // The class is not trained with the weapon (2024 Bards, Druids and Clerics: simple weapons only).
          if (line && /not proficient/.test(line.notes) && fileB - ours === sh.proficiency)
            return "FastCharacter adds proficiency with a weapon the character is not trained with";
          // Martial Arts lets a Monk use Dexterity with Monk weapons.
          if (line && /Martial Arts/.test(line.notes) && ours - fileB === mod("dexterity") - mod("strength"))
            return "FastCharacter uses Strength where Martial Arts lets the Monk use Dexterity";
          // Pact of the Blade: Soul Forge shows a melee weapon as it attacks when bonded (Charisma); the file unbonded.
          if (line && names.has("pact of the blade") && ours - fileB === mod("charisma") - Math.max(mod("strength"), mod("dexterity")))
            return "Soul Forge shows the weapon as Pact of the Blade's bonded weapon (Charisma); FastCharacter shows it unbonded";
          // The carried weapon is magic, and the file's line leaves its bonus out.
          if (line && (line.magic ?? 0) > 0 && ours - fileB === line.magic)
            return "FastCharacter's attack line leaves out the weapon's magic bonus";
        }
        // A skill the file has and the rules do not give: every skill choice is made (none left open).
        const prof = /^([A-Za-z ]+): the file has proficiency, Soul Forge has no proficiency$/.exec(d);
        const same = prof ?? (m && Number(m[2]) - Number(m[3]) === sh.proficiency ? m : null);
        if (
          same &&
          !skillOpen &&
          sh.skills.some((k) => k.name.toLowerCase() === same[1].toLowerCase()) &&
          res.differences.some((x) => x === `${same[1]}: the file has proficiency, Soul Forge has no proficiency`)
        )
          return "FastCharacter lists a skill proficiency the rules do not give (every skill choice is made)";
        return undefined;
      };
      // Passive Perception follows Perception: the same gap, explained when Perception's is.
      const percGap = (() => {
        const m = res.differences.map((x) => /^Perception: the file says (-?\d+), Soul Forge works out (-?\d+)$/.exec(x)).find(Boolean);
        return m && explain(m[0]) ? Number(m[1]) - Number(m[2]) : undefined;
      })();
      const explainAll = (d: string) => {
        const p = /^Passive Perception: the file says (-?\d+), Soul Forge works out (-?\d+)$/.exec(d);
        if (p && percGap !== undefined && Number(p[1]) - Number(p[2]) === percGap) return "follows the Perception difference, explained";
        return explain(d);
      };
      for (const d of res.differences) {
        const why = explainAll(d);
        out.push(`- differs: ${d}${why ? ` (explained: ${why})` : ""}`);
        count(why ? "explained" : `differs: ${d.split(":")[0].replace(/ attack$/, " (attack)")}`);
      }
      for (const m of res.missing) {
        out.push(`- not found: ${m}`);
        count(`not found: ${m.replace(/^.*\(/, "(")}`);
      }
      for (const t of res.todo) {
        out.push(`- left open: ${t}`);
        count("left open");
      }
      for (const x of findings) {
        out.push(`- rules: ${x.rule}: ${x.detail}`);
        count(`rules: ${x.rule}`);
      }
      out.push("");
    }
    out.splice(2, 0, "## Counts", ...[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n}`), "");
    writeFileSync(join(C!, "fastcharacter", "report.md"), out.join("\n"));
    console.log(
      `FASTCHAR ${[...kinds]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`)
        .join("; ")}`,
    );
    // An import never leaves a pick that repeats what the character has from elsewhere (it is taken back and left open).
    expect(kinds.get("rules: A choice repeats something the character already has") ?? 0).toBe(0);
    // W9: the unexplained differences never grow (RULES_SNAPSHOT=1 accepts a new count).
    const unexplained = [...kinds].filter(([k]) => k.startsWith("differs:")).reduce((n, [, v]) => n + v, 0);
    const base = join(C!, "fastcharacter", "count.json");
    const was = existsSync(base) ? (JSON.parse(readFileSync(base, "utf8")) as { unexplained?: number }) : {};
    if (!existsSync(base) || process.env.RULES_SNAPSHOT)
      writeFileSync(base, JSON.stringify({ unexplained, explained: kinds.get("explained") ?? 0 }));
    console.log(`FASTCHAR unexplained ${unexplained}, explained ${kinds.get("explained") ?? 0} (accepted ${JSON.stringify(was)})`);
    if (typeof was.unexplained === "number") expect(unexplained).toBeLessThanOrEqual(was.unexplained);
  },
  3600000,
);
