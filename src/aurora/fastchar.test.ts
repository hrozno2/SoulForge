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
      // How many skills each side is proficient in: the file's own list, and Soul Forge's sheet.
      const fileSkillCount = (/^\s*•\s*Skills:\s*(.+)$/m.exec(text)?.[1] ?? "").split(",").filter((x) => x.trim()).length;
      const oursSkillCount = sh.skills.filter((k) => k.level !== "none").length;
      // An open choice of skills (not of tools: Student of War's tool choice left open is not a skill choice).
      const skillOpen = res.todo.some((t) => /skill|expertise|primal knowledge/i.test(t) && !/^Build: Tool/i.test(t));
      // FastCharacter's own contradictions: expertise ("**") on a skill its Skills list lacks; a proficiency its features
      // name ("Skillful (Acrobatics proficiency)") that the list leaves out.
      const listed = new Set(
        (/^\s*•\s*Skills:\s*(.+)$/m.exec(text)?.[1] ?? "")
          .split(",")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean),
      );
      const markedExpert = [...text.matchAll(/^\S+ \.\.\. (.+?) Skill\s+\*\*/gm)].map((x) => x[1].toLowerCase());
      const expertNotListed = markedExpert.filter((x) => !listed.has(x));
      const namedInFeatures = new Set(
        [...text.matchAll(/\(([A-Z][a-z]+(?: [a-z]+ [A-Z][a-z]+| [A-Z][a-z]+)?) proficiency\)/g)].map((x) => x[1].toLowerCase()),
      );
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
          fileSkillCount > oursSkillCount &&
          sh.skills.some((k) => k.name.toLowerCase() === same[1].toLowerCase()) &&
          res.differences.some((x) => x === `${same[1]}: the file has proficiency, Soul Forge has no proficiency`)
        )
          return "FastCharacter lists a skill proficiency the rules do not give (every skill choice is made)";
        const sk = /^([A-Za-z ]+): (?:the file|the file says)/.exec(d)?.[1].toLowerCase();
        // B: the file marks expertise on a skill its list lacks; Soul Forge followed the mark, so that skill and the one
        // it displaced differ.
        if (
          sk &&
          expertNotListed.length &&
          (expertNotListed.includes(sk) || (listed.has(sk) && !sh.skills.some((k) => k.name.toLowerCase() === sk && k.level !== "none")))
        )
          return "FastCharacter marks expertise on a skill its own list does not have; Soul Forge followed the mark";
        // B, the displaced half: a listed skill the file values one proficiency bonus higher (its expertise, unmarked).
        const val = /^([A-Za-z ]+): the file says (-?\d+), Soul Forge works out (-?\d+)$/.exec(d);
        if (sk && val && expertNotListed.length && listed.has(sk) && Number(val[2]) - Number(val[3]) === sh.proficiency)
          return "FastCharacter marks expertise on a skill its own list does not have; Soul Forge followed the mark";
        // More expertise than the rules give (a Ranger's Deft Explorer: one skill, until the second Expertise at 9th
        // level): every expertise choice is made, and the file marks more.
        const oursExpert = sh.skills.filter((k) => k.level === "expertise").length;
        const expertOpen = res.todo.some((t) => /expertise/i.test(t));
        if (
          sk &&
          !expertOpen &&
          markedExpert.length > oursExpert &&
          (/the file has expertise, Soul Forge has proficiency$/.test(d) || (val && Number(val[2]) - Number(val[3]) === sh.proficiency))
        )
          return "FastCharacter gives more expertise than the rules allow (every expertise choice is made)";
        // A saving throw the file has and the rules do not give: the file lists more save proficiencies than Soul Forge
        // gives, every choice made (Iron Mind gives Wisdom; FastCharacter adds Intelligence too).
        const saveProf = /^(\w+) saving throw: the file is proficient, Soul Forge is not$/.exec(d);
        const fileSaves = (/^\s*•\s*Saving Throws:\s*(.+)$/m.exec(text)?.[1] ?? "").split(",").filter((x) => x.trim()).length;
        const oursSaves = sh.abilities.filter((a) => a.saveProficient).length;
        const saveVal = /^(\w+) saving throw: the file says (-?\d+), Soul Forge works out (-?\d+)$/.exec(d);
        if (
          fileSaves > oursSaves &&
          res.todo.length === res.todo.filter((t) => !/sav/i.test(t)).length &&
          (saveProf || (saveVal && Number(saveVal[2]) - Number(saveVal[3]) === sh.proficiency))
        )
          return "FastCharacter lists a saving throw proficiency the rules do not give";
        // The 2024 Draconic Resilience: 10 + Dexterity + Charisma; the file works out the 2014 rule, 13 + Dexterity.
        const acD = /^Armor class: the file says (\d+), Soul Forge works out (\d+)$/.exec(d);
        if (acD && sh.ac.parts.some((x) => /Draconic Resilience/.test(x))) {
          const mod = (id: string) => sh.abilities.find((a) => a.id === id)!.mod;
          if (Number(acD[2]) === 10 + mod("dexterity") + mod("charisma") && Number(acD[1]) === 13 + mod("dexterity"))
            return "FastCharacter works out Draconic Resilience by the 2014 rule (13 + Dexterity), not the 2024 one (10 + Dexterity + Charisma)";
        }
        // An attuned item that adds to initiative (a Stone of Good Luck: every ability check), left out by the file.
        const initD = /^Initiative: the file says (-?\d+), Soul Forge works out (-?\d+)$/.exec(d);
        if (initD) {
          const fromItems = r.active
            .filter((a) => /item|magic/i.test(a.el.type))
            .flatMap((a) =>
              a.el.rules
                .filter((x) => x.kind === "stat" && x.name === "initiative")
                .map((x) => Number((x as { value: string }).value) || 0),
            )
            .reduce((n, v) => n + v, 0);
          if (fromItems && Number(initD[2]) - Number(initD[1]) === fromItems)
            return "FastCharacter leaves out an attuned item's bonus to initiative";
        }
        // C: a proficiency the file's features name and its list leaves out.
        if (
          sk &&
          namedInFeatures.has(sk) &&
          !listed.has(sk) &&
          /the file has no proficiency, Soul Forge has proficiency$|the file says/.test(d)
        )
          return "FastCharacter names this proficiency in its features but leaves it out of its skill list";
        // D: a skill the file has that the open skill choice does not offer: the choice is left for the player.
        if (sk && /the file has proficiency, Soul Forge has no proficiency$|the file says/.test(d) && listed.has(sk)) {
          const offers = r.slots.some(
            (x) =>
              x.chosen.length < x.rule.number &&
              /skill/i.test(x.rule.name) &&
              x.options.some((o) => o.name.toLowerCase().replace(/^skill proficiency \((.+)\)$/, "$1") === sk),
          );
          if (skillOpen && !offers) return "FastCharacter takes a skill the class's choice does not offer; the choice is left open";
        }
        // A tool the file lists that no rule gives: no tool choice left open, and no tool of Soul Forge's missing from the
        // file (the 2024 Farmer gives Carpenter's Tools; FastCharacter adds a second artisan's tool).
        if (
          /^Tool .+: in the file, not in Soul Forge$/.test(d) &&
          !res.todo.some((t) => /tool|instrument|gaming|artisan/i.test(t)) &&
          !res.differences.some((x) => /^Tool .+: in Soul Forge, not in the file$/.test(x))
        )
          return "FastCharacter lists a tool the rules do not give (every tool choice is made)";
        return undefined;
      };
      // Passive Perception follows Perception: the same gap, explained when Perception's is.
      const percGap = (() => {
        const m = res.differences.map((x) => /^Perception: the file says (-?\d+), Soul Forge works out (-?\d+)$/.exec(x)).find(Boolean);
        return m && explain(m[0]) ? Number(m[1]) - Number(m[2]) : undefined;
      })();
      // A skill's value gap follows its proficiency gap: explained when that is.
      const levelExplained = new Set(
        res.differences
          .filter((x) => /: the file has (?:no )?(?:proficiency|expertise), Soul Forge has/.test(x) && explain(x))
          .map((x) => x.split(":")[0].toLowerCase()),
      );
      const explainAll = (d: string) => {
        const v = /^([A-Za-z ]+): the file says -?\d+, Soul Forge works out -?\d+$/.exec(d);
        if (v && levelExplained.has(v[1].toLowerCase())) return "follows the proficiency difference, explained";
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
    // And the rules findings beyond the choices left open (two went unseen before: a 2024 Sorcerer given Tasha's
    // Aberrant Mind for its old name, 2026-11-18).
    const rulesOther = [...kinds]
      .filter(([k]) => k.startsWith("rules:") && k !== "rules: A required choice is not made")
      .reduce((n, [, v]) => n + v, 0);
    const was = existsSync(base) ? (JSON.parse(readFileSync(base, "utf8")) as { unexplained?: number; rules?: number }) : {};
    if (!existsSync(base) || process.env.RULES_SNAPSHOT)
      writeFileSync(base, JSON.stringify({ unexplained, explained: kinds.get("explained") ?? 0, rules: rulesOther }));
    console.log(`FASTCHAR unexplained ${unexplained}, explained ${kinds.get("explained") ?? 0} (accepted ${JSON.stringify(was)})`);
    if (typeof was.unexplained === "number") expect(unexplained).toBeLessThanOrEqual(was.unexplained);
    if (typeof was.rules === "number") expect(rulesOther, "rules findings beyond open choices").toBeLessThanOrEqual(was.rules);
  },
  3600000,
);
