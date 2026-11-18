/**
 * E1.3: a player's own move of one character from Aurora's content to 5e.tools. The dialog works the move out first
 * and shows what it would do: what changes and why, what 5e.tools has no version of (kept as text), what was chosen
 * for the player, what is theirs to decide. Only then does it make the 5e.tools copy; the original stays as it is.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Character } from "../aurora/character";
import type { ARegistry } from "../aurora/registry";
import type { AElement } from "../aurora/types";
import type { MoveResult } from "../engine/migrateReport";

/** Aurora's own element (not 5e.tools', not the SRD's, not Soul Forge's additions). */
export const isAuroraElement = (e: AElement | undefined) =>
  !!e && e.origin !== "5etools" && !e.id.startsWith("ID_5ET") && !e.id.startsWith("ID_SF_") && !/^SRD /.test(e.source);

/** The character's class, species or background is Aurora's: the move has something to do. */
export function usesAurora(ch: Character, reg: ARegistry): boolean {
  return [...ch.classes.map((c) => c.classId), ch.race ?? "", ch.background ?? ""].some((id) => !!id && isAuroraElement(reg.get(id)));
}

type State = { kind: "working"; step: string } | { kind: "ready"; res: MoveResult } | { kind: "failed"; why: string };

function List({ title, items, note }: { title: string; items: string[]; note?: string }) {
  if (!items.length) return null;
  return (
    <section>
      <h3>
        {title} ({items.length})
      </h3>
      {note && <p className="muted">{note}</p>}
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </section>
  );
}

export function MoveDialog({
  ch,
  reg,
  onCopy,
  onClose,
}: {
  ch: Character;
  /** The content as loaded: Aurora and 5e.tools together. */
  reg: ARegistry;
  /** Saves the moved copy as a new character and opens it. */
  onCopy: (moved: Character) => Promise<void>;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "working", step: "Reading 5e.tools content on its own..." });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { listSources } = await import("../aurora/storage");
        const { buildRegistry } = await import("../aurora/content");
        const { moveAndCompare } = await import("../engine/migrateReport");
        const { ensureRulesRef, rulesRef } = await import("../aurora/rulesRefStore");
        await ensureRulesRef().catch(() => undefined);
        const sources = (await listSources()).filter((s) => s.format !== "aurora");
        if (!sources.length) throw new Error("No 5e.tools content is loaded. Add it on the Content tab first.");
        const { reg: five } = await buildRegistry(sources);
        if (!live) return;
        setState({ kind: "working", step: "Working out the move..." });
        await new Promise((ok) => setTimeout(ok, 0));
        const res = moveAndCompare(ch, reg, five, rulesRef() ?? []);
        if (live) setState({ kind: "ready", res: { ...res, name: ch.name } });
      } catch (e) {
        if (live) setState({ kind: "failed", why: (e as Error).message });
      }
    })();
    return () => {
      live = false;
    };
  }, [ch, reg]);

  const make = async () => {
    if (state.kind !== "ready") return;
    setSaving(true);
    try {
      const { moveNote } = await import("../engine/migrateReport");
      await onCopy({
        ...state.res.migration.ch,
        name: `${ch.name || "Character"} (5e.tools)`,
        importReport: moveNote(state.res),
      });
    } catch (e) {
      setState({ kind: "failed", why: (e as Error).message });
      setSaving(false);
    }
  };

  const res = state.kind === "ready" ? state.res : undefined;
  const m = res?.migration;
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal-page themed move-dialog" role="dialog" aria-label="Move to 5e.tools" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Move {ch.name || "this character"} to 5e.tools</h2>
        <p className="muted">
          This makes a copy that uses 5e.tools' content. The character as it is now stays in your library, unchanged, so you can compare the
          two or go back.
        </p>
        {state.kind === "working" && <p role="status">{state.step}</p>}
        {state.kind === "failed" && (
          <p role="alert" className="warn">
            The move could not be worked out: {state.why}
          </p>
        )}
        {res && m && (
          <>
            {!res.changed.length && !res.dropped.length && !res.unavailable.length && (
              <p>The sheet comes out the same: every number, feature, spell and item.</p>
            )}
            {m.speciesSwitched && (
              <p>
                The species becomes {m.speciesSwitched.to}: 5e.tools files {m.speciesSwitched.from} under it.
              </p>
            )}
            <List title="What changes on the sheet" items={res.changed} />
            <List title="Why some things differ" items={res.explained} note="Where 5e.tools follows the book and Aurora's files did not." />
            <List
              title="Not on the sheet any more"
              items={[...res.dropped, ...res.unavailable].filter((x, i, a) => a.indexOf(x) === i)}
              note="5e.tools has no version of these. Their text is kept in the copy's notes."
            />
            <List title="Kept as text" items={m.textKept.map((x) => `${x.name} (${x.type})`)} />
            <List title="Gear kept as custom items" items={m.customItems} />
            <List title="Your picks kept where 5e.tools has no choice for them" items={m.kept} />
            <List title="Chosen for you" items={m.filled} note="Choices 5e.tools asks that Aurora did not. Change them on Build." />
            <List title="Yours to decide" items={m.decisions.map((d) => d.what)} note="On Build, after the move." />
            <List title="Picks the 5e.tools rules rule out, kept as you made them" items={m.againstRules} />
            <List title="Rules to check" items={res.rules} />
            <p className="muted">All of this is also written into the copy's import notes.</p>
          </>
        )}
        <div className="levelup-foot">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={make} disabled={!res || saving}>
            {saving ? "Making the copy..." : "Make the 5e.tools copy"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
