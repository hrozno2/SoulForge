/**
 * A check that the packaged app works under its content security policy. It runs only when the app is started
 * with SOULFORGE_SELFTEST=<report file>, writes a JSON report and quits. CI and developers use it on a real build.
 */
interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export async function maybeRunSelfTest(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const path = await invoke<string | null>("selftest_path");
  if (!path) return;
  const violations: string[] = [];
  document.addEventListener("securitypolicyviolation", (e) => violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  const checks: Check[] = [];
  const run = async (name: string, f: () => Promise<string | void>) => {
    try {
      checks.push({ name, ok: true, detail: (await f()) || undefined });
    } catch (e) {
      checks.push({ name, ok: false, detail: String((e as Error)?.message ?? e) });
    }
  };

  await run("fonts load", async () => {
    await document.fonts.load("600 16px Cinzel");
    await document.fonts.load("400 16px 'Roboto Condensed'");
    if (!document.fonts.check("600 16px Cinzel")) throw new Error("Cinzel did not load");
  });
  await run("storage", async () => {
    localStorage.setItem("charforge.selftest", "1");
    localStorage.removeItem("charforge.selftest");
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open("charforge-selftest", 1);
      r.onsuccess = () => { r.result.close(); indexedDB.deleteDatabase("charforge-selftest"); res(); };
      r.onerror = () => rej(r.error);
    });
  });
  await run("network over https", async () => {
    const res = await fetch("https://raw.githubusercontent.com/AuroraLegacy/elements/master/AuroraLegacy.index", { cache: "no-cache" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return `status ${res.status}`;
  });
  await run("local server allowed by policy", async () => {
    try {
      await fetch("http://127.0.0.1:9/", { signal: AbortSignal.timeout(2000) });
    } catch (e) {
      // The connection fails because nothing listens there. A policy block would be reported as a violation.
      return String((e as Error).name);
    }
  });
  await run("image from data and blob URLs", async () => {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const load = (src: string) => new Promise<void>((res, rej) => { const i = new Image(); i.onload = () => res(); i.onerror = () => rej(new Error(`could not load ${src.slice(0, 12)}`)); i.src = src; });
    await load(`data:image/png;base64,${b64}`);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    await load(url);
    URL.revokeObjectURL(url);
  });
  await run("pdf export", async () => {
    const [{ resolve }, { ARegistry }, { newCharacter }, { buildSheet }, { buildPdf, DEFAULT_PDF_OPTIONS }, { loadFonts }] = await Promise.all([
      import("./aurora/engine"), import("./aurora/registry"), import("./aurora/character"), import("./aurora/sheet"), import("./pdf/exportPdf"), import("./pdf/fonts"),
    ]);
    const reg = new ARegistry();
    reg.build();
    const r = resolve(newCharacter(), reg);
    const bytes = await buildPdf(r, buildSheet(r), { ...DEFAULT_PDF_OPTIONS, spellCards: false, itemCards: false, featureCards: false, tips: true }, await loadFonts());
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    if (head !== "%PDF-") throw new Error(`unexpected header ${head}`);
    return `${bytes.length} bytes`;
  });
  await run("dice", async () => {
    const { rollExpression } = await import("./ui/Dice");
    const r = rollExpression("2d6+3");
    if (!r || r.total < 5 || r.total > 15) throw new Error("bad roll");
  });
  await run("no policy violations", async () => {
    await new Promise((r) => setTimeout(r, 300));
    if (violations.length) throw new Error(violations.join("; "));
  });

  const ok = checks.every((c) => c.ok);
  await invoke("selftest_finish", { report: JSON.stringify({ ok, checks }, null, 2) });
}
