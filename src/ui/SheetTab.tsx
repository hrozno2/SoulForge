import { ABILITIES, ABILITY_NAMES, SKILLS, type Character, type Sheet } from "../engine/types";
import { useState } from "react";
import { downloadText, saveFile } from "../store";
import { DEFAULT_PDF_OPTIONS, buildPdf, cardCounts, type PdfOptions } from "../pdf/exportPdf";

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
const skillLabel = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function ExportPanel({ character, sheet }: { character: Character; sheet: Sheet }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<PdfOptions>(DEFAULT_PDF_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const counts = cardCounts(sheet);
  const toggle = (k: "sheet" | "spellCards" | "itemCards" | "featureCards") => setOpts((o) => ({ ...o, [k]: !o[k] }));

  const run = async () => {
    setBusy(true);
    setMsg("");
    try {
      const { loadFonts } = await import("../pdf/fonts");
      const bytes = await buildPdf(character, sheet, opts, await loadFonts());
      const base = (character.name || "character").replace(/[^\p{L}\p{N}]+/gu, "-");
      const ok = await saveFile(`${base}.pdf`, bytes, "application/pdf");
      setMsg(ok ? "PDF saved." : "Cancelled.");
    } catch (e) {
      setMsg(`Could not create the PDF: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="noprint">
      <button className="primary" onClick={() => setOpen(!open)}>Export PDF...</button>
      {open && (
        <div className="subcard">
          <label className="check"><input type="checkbox" checked={opts.sheet} onChange={() => toggle("sheet")} /> Character sheet</label>
          <label className="check"><input type="checkbox" checked={opts.spellCards} onChange={() => toggle("spellCards")} /> Spell cards <small>{counts.spells}</small></label>
          <label className="check"><input type="checkbox" checked={opts.itemCards} onChange={() => toggle("itemCards")} /> Item cards <small>{counts.items}</small></label>
          <label className="check"><input type="checkbox" checked={opts.featureCards} onChange={() => toggle("featureCards")} /> Feat and feature cards <small>{counts.features}</small></label>
          <div className="row">
            <span className="muted">Paper</span>
            {(["a4", "letter"] as const).map((p) => (
              <button key={p} className={opts.paper === p ? "pill active" : "pill"} onClick={() => setOpts((o) => ({ ...o, paper: p }))}>
                {p === "a4" ? "A4" : "Letter"}
              </button>
            ))}
          </div>
          <p className="muted">Cards are 2.5 x 3.5 in (poker size), nine to a page, ready to cut.</p>
          <button className="primary" disabled={busy || !(opts.sheet || opts.spellCards || opts.itemCards || opts.featureCards)} onClick={run}>
            {busy ? "Creating..." : "Create PDF"}
          </button>
          {msg && <p className="notice">{msg}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Layout follows the 2024 character sheet: a header, a combat strip,
 * ability blocks with the saving throw and skills under each ability,
 * then features, feats and equipment.
 */
export function SheetTab({ character, sheet }: { character: Character; sheet: Sheet }) {
  const byType = (t: string) => sheet.elements.filter((e) => e.type === t && e.meta?.hidden !== "true");
  const first = (t: string) => sheet.elements.find((e) => e.type === t);
  const species = first("species");
  const cls = first("class");
  const bg = first("background");
  const sub = first("subclass");
  const die = cls?.hitDie ? `${character.level}d${cls.hitDie}` : "-";

  return (
    <div className="sheet-wrap">
      <div className="row noprint">
        <ExportPanel character={character} sheet={sheet} />
        <button onClick={() => window.print()}>Quick print</button>
        <button onClick={() => downloadText(`${character.name || "character"}.json`, JSON.stringify(character, null, 2))}>
          Export character
        </button>
      </div>

      <div className="sheet">
        <header className="sheet-head">
          <h1>{character.name || "Unnamed character"}</h1>
          <div className="meta">
            <div><small>Species</small>{species?.name ?? "-"}</div>
            <div><small>Class</small>{cls?.name ?? "-"}</div>
            <div><small>Subclass</small>{sub?.name ?? "-"}</div>
            <div><small>Background</small>{bg?.name ?? "-"}</div>
            <div><small>Level</small>{character.level}</div>
          </div>
        </header>

        <div className="combat">
          <div className="box"><small>Armor Class</small><b>{sheet.ac}</b></div>
          <div className="box"><small>Initiative</small><b>{sign(sheet.initiative)}</b></div>
          <div className="box"><small>Hit Points</small><b>{sheet.hp}</b></div>
          <div className="box"><small>Hit Dice</small><b>{die}</b></div>
          <div className="box"><small>Proficiency</small><b>{sign(sheet.proficiencyBonus)}</b></div>
          <div className="box"><small>Speed</small><b>{sheet.speed} ft</b></div>
          <div className="box"><small>Passive Perception</small><b>{sheet.passivePerception}</b></div>
          <div className="box"><small>Heroic Inspiration</small><b>&#9744;</b></div>
        </div>

        <div className="ability-grid">
          {ABILITIES.map((a) => (
            <div className="ability" key={a}>
              <div className="ability-head">
                <span>{ABILITY_NAMES[a]}</span>
                <b>{sign(sheet.abilities[a].mod)}</b>
                <em>{sheet.abilities[a].score}</em>
              </div>
              <div className="line">
                <i className={sheet.saves[a].proficient ? "dot on" : "dot"} />
                <span>Saving Throw</span>
                <b>{sign(sheet.saves[a].bonus)}</b>
              </div>
              {Object.entries(SKILLS)
                .filter(([, ab]) => ab === a)
                .map(([id]) => (
                  <div className="line" key={id}>
                    <i className={sheet.skills[id].level === "none" ? "dot" : sheet.skills[id].level === "expertise" ? "dot on x2" : "dot on"} />
                    <span>{skillLabel(id)}</span>
                    <b>{sign(sheet.skills[id].bonus)}</b>
                  </div>
                ))}
            </div>
          ))}
        </div>

        {sheet.spellcasting && (
          <section className="block">
            <h3>Spellcasting</h3>
            <div className="combat">
              <div className="box"><small>Ability</small><b>{sheet.spellcasting.ability.toUpperCase()}</b></div>
              <div className="box"><small>Save DC</small><b>{sheet.spellcasting.saveDC}</b></div>
              <div className="box"><small>Spell attack</small><b>{sign(sheet.spellcasting.attackBonus)}</b></div>
              {sheet.spellcasting.slots.map((n, i) =>
                n > 0 ? (
                  <div className="box" key={i}>
                    <small>{sheet.spellcasting!.pactLevel ? `Pact slots (level ${i + 1})` : `Level ${i + 1} slots`}</small>
                    <b>{n}</b>
                  </div>
                ) : null,
              )}
            </div>
          </section>
        )}

        {Object.keys(sheet.stats).length > 0 && (
          <section className="block">
            <h3>Custom stats</h3>
            {Object.entries(sheet.stats).map(([k, v]) => (
              <div className="line" key={k}><span>{k}</span><b>{sign(v)}</b></div>
            ))}
          </section>
        )}

        <div className="cols">
          <section className="block">
            <h3>Class features</h3>
            {[...byType("class"), ...byType("subclass")].map((e) => (
              <p key={e.id}><b>{e.name}.</b> {e.description}</p>
            ))}
          </section>
          <section className="block">
            <h3>Species traits</h3>
            {[...byType("species"), ...byType("feature")].map((e) => (
              <p key={e.id}><b>{e.name}.</b> {e.description}</p>
            ))}
          </section>
          <section className="block">
            <h3>Feats and background</h3>
            {[...byType("background"), ...byType("feat")].map((e) => (
              <p key={e.id}><b>{e.name}.</b> {e.description}</p>
            ))}
          </section>
          <section className="block">
            <h3>Equipment</h3>
            {byType("item").map((e) => (
              <p key={e.id}><b>{e.name}.</b> {e.description}</p>
            ))}
          </section>
        </div>

        {sheet.pending.length > 0 && (
          <p className="warn noprint">Unfinished choices: {sheet.pending.map((p) => p.label).join(", ")}</p>
        )}
      </div>
    </div>
  );
}
