import { useEffect, useRef, useState } from "react";
import type { Resolved } from "../aurora/engine";
import type { SheetData } from "../aurora/sheet";
import { deleteTemplate, listTemplates, saveTemplate, type TemplateRecord } from "../aurora/storage";
import { uid } from "../aurora/character";
import { buildFillData, companionFill } from "../sheets/data";
import { DLDM_PAGES, detectPages, fillDldm, type DldmPage } from "../sheets/dldm";
import { companionLayoutOfPdf, fillCompanion } from "../sheets/companion";
import { readWidgets } from "../sheets/widgets";
import { saveFile } from "../store";

/** Fill the player's own copy of a fillable character sheet PDF. The PDF is stored on this computer only. */
export function TemplateExport({ r, sheet }: { r: Resolved; sheet: SheetData }) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [pick, setPick] = useState("");
  const [pages, setPages] = useState<DldmPage[]>([]);
  const [companion, setCompanion] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listTemplates().then(setTemplates);
  useEffect(() => { refresh(); }, []);
  const current = templates.find((t) => t.id === pick) ?? templates.find((t) => t.kind === "dldm5e24") ?? templates[0];
  useEffect(() => {
    if (current?.kind === "dldm5e24") setPages(current.pages as DldmPage[]);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const companions = [
    ...r.active.filter((a) => a.el.type === "Companion").map((a) => ({ id: a.el.id, name: a.el.name })),
    ...r.character.companions.map((c) => ({ id: c.id, name: c.name })),
  ];
  const companionList = companions.filter((c, i, a) => c.id && a.findIndex((x) => x.id === c.id && x.name === c.name) === i);

  const add = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setMsg("Reading...");
    const notes: string[] = [];
    for (const file of [...list]) {
      try {
        const bytes = await file.arrayBuffer();
        const { PDFDocument } = await import("pdf-lib");
        const doc = await PDFDocument.load(bytes);
        const found = [...detectPages(readWidgets(doc)).values()];
        if (found.length) {
          await saveTemplate({ id: uid(), name: file.name.replace(/\.pdf$/i, ""), kind: "dldm5e24", pages: found, bytes, added: Date.now() });
          notes.push(`${file.name}: ${found.map((p) => DLDM_PAGES[p].label).join(", ")}`);
          continue;
        }
        const layout = await companionLayoutOfPdf(bytes, file.name);
        if (layout) {
          await saveTemplate({ id: uid(), name: file.name.replace(/\.pdf$/i, ""), kind: "companion", pages: [layout], bytes, added: Date.now() });
          notes.push(`${file.name}: companion sheet`);
        } else notes.push(`${file.name}: not a sheet CharForge can fill (it fills the DLDM 5E24 character sheets and the DLDM companion sheets)`);
      } catch (e) {
        notes.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    setMsg(notes.join(". "));
    refresh();
  };

  const run = async () => {
    if (!current) return;
    setBusy(true);
    setMsg("");
    try {
      const { loadFonts } = await import("../pdf/fonts");
      const fonts = await loadFonts();
      const base = (r.character.name || "character").replace(/[^\p{L}\p{N}]+/gu, "-");
      let bytes: Uint8Array;
      let notes: string[] = [];
      if (current.kind === "dldm5e24") {
        const res = await fillDldm(current.bytes, buildFillData(r, sheet), { pages, font: fonts });
        bytes = res.bytes;
        notes = res.notes;
      } else {
        const id = companion || companionList[0]?.id;
        const el = id ? r.reg.get(id) : undefined;
        if (!el) throw new Error("This character has no companion yet. Add one on the Manage tab.");
        const name = r.character.companions.find((c) => c.id === id)?.name ?? el.name;
        bytes = await fillCompanion(current.bytes, companionFill(el, name), { font: fonts, profBonus: sheet.proficiency >= 0 ? `+${sheet.proficiency}` : String(sheet.proficiency), layout: current.pages[0] as "mount" | "ranger" });
      }
      const ok = await saveFile(`${base} - ${current.name}.pdf`, bytes, "application/pdf");
      setMsg([ok ? "Saved." : "Cancelled.", ...notes].join(" "));
    } catch (e) {
      setMsg(`Could not fill the sheet: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="subcard">
      <h3>Fillable sheets</h3>
      <p className="muted">Load your own copy of a fillable character sheet. CharForge fills it in and keeps it editable. Supported: the DLDM 5E24 sheets (the five-page file or single pages) and the DLDM companion sheets.</p>
      <div className="row">
        <button onClick={() => fileRef.current?.click()}>Add sheet PDF...</button>
        <input ref={fileRef} type="file" accept=".pdf" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {templates.length > 0 && (
        <>
          <div className="row">
            <select value={current?.id ?? ""} onChange={(e) => setPick(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {current && <button onClick={async () => { await deleteTemplate(current.id); setPick(""); refresh(); }}>Remove</button>}
          </div>
          {current?.kind === "dldm5e24" && (
            <div>
              {(current.pages as DldmPage[]).map((p) => (
                <label key={p} className="check">
                  <input type="checkbox" checked={pages.includes(p)} onChange={() => setPages((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))} />
                  {DLDM_PAGES[p].label} <small className="muted">{DLDM_PAGES[p].note}</small>
                </label>
              ))}
            </div>
          )}
          {current?.kind === "companion" && (
            <div className="row">
              <span className="muted">Companion</span>
              <select value={companion} onChange={(e) => setCompanion(e.target.value)}>
                {companionList.length === 0 && <option value="">none yet</option>}
                {companionList.map((c) => <option key={c.id + c.name} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <button className="primary" disabled={busy || !current || (current.kind === "dldm5e24" && pages.length === 0)} onClick={run}>{busy ? "Filling..." : "Fill and save"}</button>
        </>
      )}
      {msg && <p className="notice">{msg}</p>}
    </div>
  );
}
