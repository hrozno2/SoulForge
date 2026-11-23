/**
 * The guided first character (Chris 2026-11-23, src/aurora/guide.ts), part of the tutorial: a small panel beside the
 * real Build board. It asks two plain questions, recommends, and says what to do next; the player clicks and drags
 * the real cards. It watches the character and moves on when a step is done. Nothing is picked for the player, except
 * the recommended scores when they ask for them.
 */
import { setGuideMarks } from "./guideMarks";
import { useEffect, useState } from "react";
import type { Character } from "../aurora/character";
import { stillToChoose, type Resolved } from "../aurora/engine";
import {
  guideFor,
  recommendClasses,
  recommendedScores,
  STYLE_QUESTION,
  STYLES,
  UPKEEP_QUESTION,
  UPKEEPS,
  type PlayStyle,
  type Upkeep,
} from "../aurora/guide";

export function GuideCoach({
  r,
  set,
  onGo,
  onClose,
}: {
  r: Resolved;
  set: (fn: (c: Character) => Character) => void;
  onGo: (tab: string) => void;
  onClose: () => void;
}) {
  const ch = r.character;
  const [style, setStyle] = useState<PlayStyle | null>(null);
  const [upkeep, setUpkeep] = useState<Upkeep | null>(null);
  const [scores, setScores] = useState(false);
  const cls = ch.classes[0] ? r.reg.get(ch.classes[0].classId)?.name : undefined;
  const guide = guideFor(cls);
  const open = r.slots.filter((s) => stillToChoose(s, r)).length;
  const step =
    !style || !upkeep
      ? "ask"
      : !cls
        ? "class"
        : !ch.race
          ? "species"
          : !ch.background
            ? "background"
            : !scores
              ? "scores"
              : open
                ? "choices"
                : "done";
  // The step's recommendations are marked on their cards in the lists; nothing is marked once the guide moves on.
  const marked =
    step === "class" && style && upkeep
      ? { type: "Class", names: recommendClasses(style, upkeep).map((c) => c.name) }
      : step === "species"
        ? { type: "Race", names: guide?.species ?? ["Human"] }
        : step === "background"
          ? { type: "Background", names: guide?.backgrounds ?? ["Soldier"] }
          : null;
  const markKey = marked ? `${marked.type}:${marked.names.join("|")}` : "";
  useEffect(() => {
    setGuideMarks(marked);
    return () => setGuideMarks(null);
  }, [markKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = ["ask", "class", "species", "background", "scores", "choices", "done"];
  const how = (list: string, space: string) => (
    <p className="muted">
      Open <b>{list}</b> in the lists on the left, then click a card, or drag it onto the <b>{space}</b> space on the board. Press Apply on
      the card that opens. The other options stay available: these are only where I would start.
    </p>
  );
  const recs = (names: { name: string; line?: string }[]) => (
    <ul className="guide-recs">
      {names.map((n) => (
        <li key={n.name}>
          <b>{n.name}</b>
          {n.line ? `: ${n.line}` : ""}
        </li>
      ))}
    </ul>
  );
  return (
    <aside className="guide-coach" role="region" aria-label="Guide: your first character">
      <header>
        <b>Your first character</b>
        <small>
          Step {order.indexOf(step) + 1} of {order.length}
        </small>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close the guide"
          title="Close the guide: your character stays as it is"
        >
          ×
        </button>
      </header>
      {step === "ask" && (
        <>
          <p>Two questions, then I will point you at a few good places to start. You do the choosing.</p>
          <p className="guide-q">{STYLE_QUESTION}</p>
          <div className="guide-answers">
            {STYLES.map((s) => (
              <button
                key={s.id}
                className={style === s.id ? "pill active" : "pill"}
                aria-pressed={style === s.id}
                onClick={() => setStyle(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="guide-q">{UPKEEP_QUESTION}</p>
          <div className="guide-answers">
            {UPKEEPS.map((u) => (
              <button
                key={u.id}
                className={upkeep === u.id ? "pill active" : "pill"}
                aria-pressed={upkeep === u.id}
                onClick={() => setUpkeep(u.id)}
              >
                {u.label}
              </button>
            ))}
          </div>
        </>
      )}
      {step === "class" && style && upkeep && (
        <>
          <p>
            <b>Pick a class.</b> It is what your character does. For what you told me, I would look at:
          </p>
          {recs(recommendClasses(style, upkeep))}
          {how("Class", "Class")}
          <button className="linkish" onClick={() => (setStyle(null), setUpkeep(null))}>
            Ask me again
          </button>
        </>
      )}
      {step === "species" && (
        <>
          <p>
            <b>Pick a species.</b> It is who your people are. {cls ? `For a ${cls}, these fit well:` : "These are good places to start:"}
          </p>
          {recs((guide?.species ?? ["Human"]).map((name) => ({ name })))}
          {how("Species", "Species")}
        </>
      )}
      {step === "background" && (
        <>
          <p>
            <b>Pick a background.</b> It is what you did before adventuring, and it raises your ability scores.{" "}
            {cls ? `For a ${cls}:` : "A good start:"}
          </p>
          {recs((guide?.backgrounds ?? ["Soldier"]).map((name) => ({ name })))}
          {how("Background", "Background")}
        </>
      )}
      {step === "scores" && (
        <>
          <p>
            <b>Set your ability scores.</b> They are the six numbers everything else builds on.{" "}
            {cls ? `A ${cls} wants ${guide?.scores[0] ?? "its main score"} highest.` : ""}
          </p>
          <div className="guide-answers">
            <button
              className="primary"
              onClick={() => {
                const s = cls ? recommendedScores(cls) : undefined;
                if (s) set((c) => ({ ...c, abilityMethod: "standard", abilityBase: s }));
                setScores(true);
              }}
            >
              Use the recommended spread
            </button>
            <button onClick={() => setScores(true)}>I will set them myself</button>
          </div>
          <p className="muted">You can change them any time in the scores panel on the right.</p>
        </>
      )}
      {step === "choices" && (
        <>
          <p>
            <b>Finish your cards.</b> Your cards still ask {open} {open === 1 ? "thing" : "things"}: skills, languages, a weapon to master
            and the like.
          </p>
          <p className="muted">
            Click a card with a number on it to open it, and choose what it asks. The list in each choice puts the usual picks first.
          </p>
        </>
      )}
      {step === "done" && (
        <>
          <p>
            <b>Your character is ready.</b> Everything it needs is chosen, and the rules check on Build tells you if anything is off.
          </p>
          <div className="guide-answers">
            <button onClick={() => onGo("sheet")}>See the sheet</button>
            <button onClick={() => onGo("play")}>Play</button>
            <button className="primary" onClick={onClose}>
              Done
            </button>
          </div>
          <p className="muted">Gear comes from the shop on the backpack card; the starting gear is there too.</p>
        </>
      )}
    </aside>
  );
}
