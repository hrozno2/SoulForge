import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import type { Resolved } from "../aurora/engine";
import type { SheetData } from "../aurora/sheet";
import { deleteTemplate, listTemplates, templateBytes, type TemplateRecord } from "../aurora/storage";
import { buildPdf, cardCounts } from "../pdf/exportPdf";
import { fillAuto } from "../sheets/forms";
import { fillOfficialSheet } from "../sheets/official";
import { isDesktop } from "../net";
import { buildFillData, companionFill } from "../sheets/data";
import { translateCompanion, translateFill } from "../sheets/translateFill";
import { DLDM_PAGES, fillDldm, type DldmPage } from "../sheets/dldm";
import { fillCompanion } from "../sheets/companion";
import { SheetPreview } from "./SheetPreview";
import { OFFICIAL_DOWNLOADS, SHEET_LINKS, SHEET_SEARCH } from "../sheets/links";
import { addSheetFiles, downloadOfficialSheet, mergeDuplicateSheets } from "../sheets/templates";
import { nextFrame, openExternal, pickFiles, saveFile } from "../store";
import type { Translation } from "./TranslateOptions";

/** Fill the player's own copy of a fillable character sheet PDF. The PDF is stored on this computer only. */


export function TemplateExport({ r, sheet, tr }: { r: Resolved; sheet: SheetData; tr: Translation }) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [pick, setPick] = useState("");
  const [pages, setPages] = useState<DldmPage[]>([]);
  const [companion, setCompanion] = useState("");
  const [cards, setCards] = useState({ spells: false, items: false, features: false, tips: false });
  const counts = cardCounts(r, sheet);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmPlain, setConfirmPlain] = useState(false);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [previewNote, setPreviewNote] = useState("");
  /** A sheet with no form fields: the text is drawn onto the page, so it cannot be edited afterwards. */
  const isPlain = (t: TemplateRecord) => (t.kind === "official" ? !t.form : t.kind === "wotc2024" || t.kind === "wotc2014");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listTemplates().then(setTemplates);
  useEffect(() => { void mergeDuplicateSheets().then(refresh); }, []);
  const current = templates.find((t) => t.id === pick) ?? templates.find((t) => t.kind === "official" && t.form) ?? templates.find((t) => t.kind === "official") ?? templates.find((t) => t.kind === "dldm5e24") ?? templates[0];
  useEffect(() => {
    if (current?.kind === "dldm5e24") setPages(current.pages as DldmPage[]);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const companions = [
    ...r.active.filter((a) => a.el.type === "Companion").map((a) => ({ id: a.el.id, name: a.el.name })),
    ...r.character.companions.map((c) => ({ id: c.id, name: c.name })),
  ];
  const companionList = companions.filter((c, i, a) => c.id && a.findIndex((x) => x.id === c.id && x.name === c.name) === i);

  /** Gets an official sheet from Wizards' own address and adds it. Needs the desktop app; the web version opens the link. */
  const getOfficial = async (o: (typeof OFFICIAL_DOWNLOADS)[number]) => {
    if (!isDesktop()) return openExternal(o.url);
    try {
      setMsg(`Downloading ${o.label}...`);
      setMsg((await downloadOfficialSheet(o)).join(". "));
      refresh();
    } catch (e) {
      setMsg(`Could not download it: ${(e as Error).message} You can open the link and load the file yourself.`);
    }
  };
  const choose = async () => {
    const files = await pickFiles(["pdf"], true);
    if (files === null) fileRef.current?.click();
    else add(files);
  };

  const add = async (picked: FileList | File[] | null) => {
    // The list of files empties when the input is reset, so take the files out of it right away.
    const list = picked ? Array.from(picked) : [];
    if (!list.length) return;
    setMsg("Reading...");
    await nextFrame();
    const notes = await addSheetFiles(list);
    setMsg(notes.join(". "));
    refresh();
  };

    /** How many pieces of text the translation service could not do during this export. */
  const failedRef = useRef(0);
  const onFailed = (f: number) => { failedRef.current += f; };
  /** The values for the sheet, translated when a language is chosen. */
  const fillData = async (translate = true) => {
    const data = buildFillData(r, sheet);
    if (!translate) return data;
    const t = tr.option((d, n) => setMsg(`Translating ${d} of ${n}...`), (f) => onFailed(f));
    return t ? translateFill(data, t) : data;
  };

  /** Fills the chosen sheet. A preview skips translation and the extra cards, so it is quick and costs nothing. */
  const build = async (preview: boolean): Promise<{ bytes: Uint8Array; notes: string[] }> => {
    if (!current) throw new Error("No sheet chosen.");
    const { loadFonts } = await import("../pdf/fonts");
    const fonts = await loadFonts();
    let bytes: Uint8Array;
    let notes: string[] = [];
    const tpl = await templateBytes(current.id);
    const data = () => fillData(!preview);
    if (current.kind === "auto") {
      const res = await fillAuto(tpl, await data(), fonts);
      bytes = res.bytes;
      notes = res.notes;
    } else if (current.kind === "official" || current.kind.startsWith("wotc")) {
      const res = await fillOfficialSheet(tpl, current.name, await data(), fonts);
      bytes = res.bytes;
      notes = res.notes;
    } else if (current.kind === "dldm5e24") {
      const res = await fillDldm(tpl, await data(), { pages, font: fonts });
      bytes = res.bytes;
      notes = res.notes;
    } else {
      const id = companion || companionList[0]?.id;
      const el = id ? r.reg.get(id) : undefined;
      if (!el) throw new Error("This character has no companion yet. Add one on the Manage tab.");
      const name = r.character.companions.find((c) => c.id === id)?.name ?? el.name;
      const cf = companionFill(el, name, r.reg);
      const t = preview ? undefined : tr.option((d, n) => setMsg(`Translating ${d} of ${n}...`), onFailed);
      bytes = await fillCompanion(tpl, t ? await translateCompanion(cf, t) : cf, { font: fonts, profBonus: sheet.proficiency >= 0 ? `+${sheet.proficiency}` : String(sheet.proficiency), layout: current.pages[0] as "mount" | "ranger" });
    }
    return { bytes, notes };
  };

  // The preview refreshes when the sheet or its page choice changes. It never translates and never saves.
  const previewKey = current ? `${current.id}|${pages.join(",")}|${companion}|${r.character.name}|${r.totalLevel}` : "";
  useEffect(() => {
    if (!current) { setPreviewBytes(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      build(true).then((res) => { if (live) { setPreviewBytes(res.bytes); setPreviewNote(""); } }).catch((e) => { if (live) { setPreviewBytes(null); setPreviewNote((e as Error).message); } });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    if (!current) return;
    failedRef.current = 0;
    setBusy(true);
    setMsg("");
    try {
      const { loadFonts } = await import("../pdf/fonts");
      const fonts = await loadFonts();
      const base = (r.character.name || "character").replace(/[^\p{L}\p{N}]+/gu, "-");
      const built = await build(false);
      let bytes = built.bytes;
      const notes = built.notes;
      if (cards.spells || cards.items || cards.features || cards.tips) {
        const extra = await buildPdf(r, sheet, { paper: "letter", sheet: false, spellCards: cards.spells, itemCards: cards.items, featureCards: cards.features, tips: cards.tips, translate: tr.option((d, t) => setMsg(`Translating ${d} of ${t}...`), onFailed) }, fonts);
        const main = await PDFDocument.load(bytes);
        const add = await PDFDocument.load(extra);
        for (const pg of await main.copyPages(add, add.getPageIndices())) main.addPage(pg);
        bytes = await main.save();
      }
      const ok = await saveFile(`${base} - ${current.name}.pdf`, bytes, "application/pdf");
      setMsg([ok ? "Saved." : "Cancelled.", ...notes, failedRef.current ? `${failedRef.current} pieces of text could not be translated and stayed in English. Try again in a minute, or pick another translation service.` : ""].filter(Boolean).join(" "));
    } catch (e) {
      setMsg(`Could not fill the sheet: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="subcard">
      <h3>Your own sheet PDFs</h3>
      <p className="muted"><b>Best results: the official Wizards of the Coast sheets.</b> Every field on them is filled. Use the Get buttons below, or load your own copy. Other fillable sheets are matched field by field by name, and anything it cannot place is listed. Load your own copy of a sheet. Supported: the official 2024 character sheet (free from Wizards of the Coast at dndbeyond.com, search "2024 character sheet". The print version has no form fields, so Soul Forge writes the text onto it. Keep "2024" in the file name), the DLDM 5E24 sheets (stay editable) and the DLDM companion sheets. Soul Forge keeps the file on this computer only.</p>
      <div className="row">
        <button onClick={choose}>Add sheet PDF...</button>
        <span className="muted">Need one?</span>
        {OFFICIAL_DOWNLOADS.map((o) => <button key={o.id} title={`${o.note} Downloaded from Wizards of the Coast's own address and kept on this computer.`} onClick={() => getOfficial(o)}>Get: {o.label}</button>)}
        {SHEET_LINKS.map((l) => <a key={l.url} href={l.url} onClick={(e) => { e.preventDefault(); openExternal(l.url); }}>{l.label}</a>)}
        <small className="muted">A link not working? <a href={SHEET_SEARCH} onClick={(e) => { e.preventDefault(); openExternal(SHEET_SEARCH); }}>Search for the sheet</a>; any copy of the same sheet works.</small>
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
          {current && <SheetPreview bytes={previewBytes} note={previewNote} />}
          {current && current.kind !== "companion" && (
            <div>
              <small className="muted">Add to the end of the PDF</small>
              <label className="check"><input type="checkbox" checked={cards.tips} onChange={(e) => setCards({ ...cards, tips: e.target.checked })} />Tips and tricks for play</label>
              {counts.spells > 0 && <label className="check"><input type="checkbox" checked={cards.spells} onChange={(e) => setCards({ ...cards, spells: e.target.checked })} />Spell cards <small className="muted">{counts.spells}</small></label>}
              {counts.items > 0 && <label className="check"><input type="checkbox" checked={cards.items} onChange={(e) => setCards({ ...cards, items: e.target.checked })} />Item cards <small className="muted">{counts.items}</small></label>}
              {counts.features > 0 && <label className="check"><input type="checkbox" checked={cards.features} onChange={(e) => setCards({ ...cards, features: e.target.checked })} />Feature cards <small className="muted">{counts.features}</small></label>}
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
          <button className="primary" disabled={busy || !tr.ready || !current || (current.kind === "dldm5e24" && pages.length === 0)} onClick={() => (current && isPlain(current) ? setConfirmPlain(true) : run())}>{busy ? "Filling..." : "Fill and save"}</button>
          {confirmPlain && (
            <div className="modal-back" role="dialog" aria-label="This sheet is not editable" onClick={() => setConfirmPlain(false)}>
              <div className="modal-page themed" onClick={(e) => e.stopPropagation()}>
                <h2>This sheet is not a form</h2>
                <p>The copy you loaded has no form fields. Soul Forge will write the text straight onto the page, so afterwards <b>you cannot edit it in a PDF viewer</b>: a mistake means making the PDF again from Soul Forge.</p>
                <p className="muted">A fillable copy of the same sheet keeps every box editable. The official 2014 sheet and the DLDM sheets come as fillable files.</p>
                <div className="row">
                  <button className="primary" onClick={() => { setConfirmPlain(false); run(); }}>Proceed</button>
                  <button onClick={() => setConfirmPlain(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <p className="notice">{msg}</p>}
    </div>
  );
}
