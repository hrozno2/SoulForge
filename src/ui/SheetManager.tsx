import { useEffect, useState } from "react";
import { deleteTemplate, saveTemplate, templateBytes, type TemplateRecord } from "../aurora/storage";
import { openPdf } from "../pdf/preview";

/** What kind of sheet a stored file is, in a few words. */
export function sheetKind(t: TemplateRecord): string {
  if (t.kind === "official") return t.form ? "Official, fillable" : "Official, print copy";
  if (t.kind === "dldm5e24") return "DLDM 2024, fillable";
  if (t.kind === "companion") return "Companion sheet";
  if (t.kind === "auto") return "Your own fillable sheet";
  return t.kind.endsWith("form") ? "Official, fillable" : "Official, print copy";
}

/** Every stored sheet side by side: a picture of its first page, rename, use and remove. */
export function SheetManager({ templates, current, onUse, onChanged, onClose, msg, children }: { templates: TemplateRecord[]; current?: string; onUse: (id: string) => void; onChanged: () => void; onClose: () => void; msg?: string; children?: React.ReactNode }) {
  const [thumbs, setThumbs] = useState<Record<string, { img: string; pages: number } | "error">>({});
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    void (async () => {
      // One at a time, so a long list does not open every PDF at once.
      for (const t of templates) {
        if (stop || thumbs[t.id]) continue;
        try {
          const pdf = await openPdf(new Uint8Array(await templateBytes(t.id)));
          const img = await pdf.page(0, 180);
          const pages = pdf.count;
          pdf.destroy();
          if (!stop) setThumbs((m) => ({ ...m, [t.id]: { img, pages } }));
        } catch {
          if (!stop) setThumbs((m) => ({ ...m, [t.id]: "error" }));
        }
      }
    })();
    return () => { stop = true; };
  }, [templates]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const rename = async () => {
    if (!editing) return;
    const t = templates.find((x) => x.id === editing.id);
    const name = editing.name.trim();
    setEditing(null);
    if (!t || !name || name === t.name) return;
    await saveTemplate({ ...t, name }, await templateBytes(t.id));
    onChanged();
  };

  return (
    <div className="modal-back" role="dialog" aria-label="Manage sheets" onClick={onClose}>
      <div className="modal-page themed sheet-manager" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <h2>Your sheets</h2>
        <p className="muted">Stored on this computer only. Click a name to rename it.</p>
        {templates.length === 0 && <p>No sheets yet.</p>}
        <ul className="sheet-grid">
          {templates.map((t) => {
            const th = thumbs[t.id];
            return (
              <li key={t.id} className={t.id === current ? "on" : ""}>
                <div className="sheet-thumb">
                  {th === undefined && <span className="muted">Loading...</span>}
                  {th === "error" && <span className="muted">No preview</span>}
                  {th && th !== "error" && <img src={th.img} alt={`First page of ${t.name}`} />}
                </div>
                {editing?.id === t.id ? (
                  <input autoFocus aria-label="Sheet name" value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} onBlur={rename} onKeyDown={(e) => { if (e.key === "Enter") void rename(); if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }} />
                ) : (
                  <button className="sheet-name" title="Rename" onClick={() => setEditing({ id: t.id, name: t.name })}>{t.name}</button>
                )}
                <small className="muted">
                  {sheetKind(t)}
                  {th && th !== "error" ? ` · ${th.pages} page${th.pages === 1 ? "" : "s"}` : ""} · {Math.max(1, Math.round(t.size / 1024))} KB · added {new Date(t.added).toLocaleDateString()}
                </small>
                {removing === t.id ? (
                  <div className="row">
                    <span>Remove it?</span>
                    <button className="danger" onClick={async () => { await deleteTemplate(t.id); setRemoving(null); onChanged(); }}>Remove</button>
                    <button onClick={() => setRemoving(null)}>Keep</button>
                  </div>
                ) : (
                  <div className="row">
                    {t.id === current ? <span className="tag">In use</span> : <button className="primary" onClick={() => { onUse(t.id); onClose(); }}>Use</button>}
                    <button className="ghost" onClick={() => setRemoving(t.id)}>Remove...</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <h3 className="sheet-manager-get">Get more sheets</h3>
        {msg && <p className="notice">{msg}</p>}
        {children}
      </div>
    </div>
  );
}
