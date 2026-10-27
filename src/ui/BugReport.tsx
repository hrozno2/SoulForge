/**
 * Report a bug (GitHub issue #4): gathers what a bug report needs, shows exactly what will be sent with a tick box
 * per part, and opens a prefilled GitHub issue or saves the report to a file. Nothing leaves the computer until the
 * player chooses to; the home folder is taken out of every line, and no settings (so no translation keys) are read.
 */
import { useEffect, useMemo, useState } from "react";
import type { Resolved } from "../aurora/engine";
import type { SourceConfig } from "../aurora/sources";
import { checkCharacter } from "../aurora/rulesCheck";
import { buildSheet } from "../aurora/sheet";
import { rulesRef } from "../aurora/rulesRefStore";
import { logLines, previousLog } from "../logbook";
import { openExternal, saveFile } from "../store";
import { REPO_URL } from "../config";

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Home folder paths (macOS, Linux, Windows) become "~", so no user name goes out. */
export function redact(text: string): string {
  return text
    .replace(/\/Users\/[^/\s"']+/g, "~")
    .replace(/\/home\/[^/\s"']+/g, "~")
    .replace(/[A-Za-z]:\\\\?Users\\\\?[^\\\s"']+/g, "~");
}

type Part = "what" | "rules" | "system" | "log" | "previous" | "content" | "character";
const LABEL: Record<Part, string> = {
  what: "What went wrong (your words)",
  rules: "Rules check of the current character",
  system: "App version and system",
  log: "Recent errors from the app",
  previous: "Errors from the last session (the log file)",
  content: "Content links (addresses only)",
  character: "The character (its saved file)",
};

export function BugReport({ r, sources, onClose }: { r: Resolved; sources: SourceConfig[]; onClose: () => void }) {
  const [what, setWhat] = useState("");
  const [system, setSystem] = useState("");
  const [on, setOn] = useState<Record<Part, boolean>>({ what: true, rules: true, system: true, log: true, previous: true, content: true, character: true });
  // The last session's log file (desktop): what went wrong before a crash or restart.
  const [previous, setPrevious] = useState("");
  useEffect(() => { void previousLog().then((t) => setPrevious(redact(t.split("\n").slice(-200).join("\n")))); }, []);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  // The system: the app version and the platform, and on the desktop what the app's own process can see.
  useEffect(() => {
    (async () => {
      const lines = [`user agent: ${navigator.userAgent}`, `screen: ${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x`];
      if (inTauri()) {
        try {
          const [{ getVersion }, { invoke }] = await Promise.all([import("@tauri-apps/api/app"), import("@tauri-apps/api/core")]);
          lines.unshift(`Soul Forge ${await getVersion()} (desktop)`);
          lines.push(await invoke<string>("diagnostics"));
        } catch (e) {
          lines.push(`diagnostics unavailable: ${String(e)}`);
        }
      } else lines.unshift("Soul Forge (web)");
      setSystem(redact(lines.join("\n")));
    })();
  }, []);

  const rules = useMemo(() => {
    const ch = r.character;
    if (!ch.classes.length) return "No class chosen yet.";
    try {
      const found = checkCharacter(r, buildSheet(r), rulesRef() ?? []);
      return found.length ? found.map((f) => `- ${f.rule}: ${f.detail}`).join("\n") : "No problems found.";
    } catch (e) {
      return `The rules check could not run: ${String(e)}`;
    }
  }, [r]);
  const charName = r.character.name || "Unnamed character";
  const summary = useMemo(() => {
    const ch = r.character;
    const name = (id?: string) => (id ? r.reg.get(id)?.name ?? id : "");
    return `${charName}: ${[name(ch.race), name(ch.background), ch.classes.map((c) => `${name(c.classId)} ${c.level}`).join(" / ")].filter(Boolean).join(", ")}`;
  }, [r, charName]);
  const characterJson = useMemo(() => redact(JSON.stringify({ ...r.character, portrait: r.character.portrait ? "(portrait left out)" : undefined }, null, 2)), [r]);
  const log = redact(logLines().join("\n")) || "Nothing logged.";
  const content = redact(sources.map((s) => `- ${s.name}: ${s.url}`).join("\n")) || "No content links.";

  const sections: [Part, string][] = [
    ["what", what.trim() || "(not filled in)"],
    ["rules", `Character: ${summary}\n${rules}`],
    ["system", system || "(gathering...)"],
    ["log", log],
    ...(previous ? [["previous", previous] as [Part, string]] : []),
    ["content", content],
  ];
  const body = (withCharacter: boolean) => [
    ...sections.filter(([k]) => on[k]).map(([k, v]) => `### ${LABEL[k]}\n${k === "what" ? v : "```\n" + v + "\n```"}`),
    ...(on.character && withCharacter ? [`### ${LABEL.character}\n\`\`\`json\n${characterJson}\n\`\`\``] : []),
  ].join("\n\n");

  const title = `Bug: ${what.trim().split("\n")[0].slice(0, 80) || `problem with ${charName}`}`;
  const openIssue = async () => {
    // A link carries a limited amount, so the character file is left for the saved report.
    let text = body(false);
    if (on.character) text += `\n\n### ${LABEL.character}\n(Attached as a file: use "Save report to file" in Soul Forge and drag it here.)`;
    if (text.length > 6000) text = `${text.slice(0, 6000)}\n\n(cut short: the rest is in the saved report)`;
    await openExternal(`${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`);
    setMsg("Opened a new GitHub issue in your browser with the report filled in. Check it and press Submit there.");
  };
  const save = async () => {
    const text = `# ${title}\n\n${body(true)}\n`;
    const ok = await saveFile(`soul-forge-bug-report-${new Date().toISOString().slice(0, 10)}.md`, new TextEncoder().encode(text), "text/markdown");
    if (ok) setMsg("Saved the report. You can attach it to a GitHub issue or send it on.");
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal-page themed bug-report" role="dialog" aria-label="Report a bug" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <h2>Report a bug</h2>
        <p className="muted">Everything below is what would be sent. Untick a part to leave it out. Nothing is sent until you open the GitHub issue or save the file yourself. Your home folder is replaced with ~ and no settings or keys are included.</p>
        <label className="bug-what">
          <b>What went wrong?</b>
          <textarea rows={4} value={what} placeholder="What you did, what you expected, and what happened instead." onChange={(e) => setWhat(e.target.value)} />
        </label>
        {sections.filter(([k]) => k !== "what").map(([k, v]) => (
          <details key={k} className="bug-part" open={k === "rules"}>
            <summary><label onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={on[k]} onChange={(e) => setOn({ ...on, [k]: e.target.checked })} /> {LABEL[k]}</label></summary>
            <pre>{v}</pre>
          </details>
        ))}
        <details className="bug-part">
          <summary><label onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={on.character} onChange={(e) => setOn({ ...on, character: e.target.checked })} /> {LABEL.character}: {charName}</label></summary>
          <pre>{characterJson.slice(0, 4000)}{characterJson.length > 4000 ? "\n..." : ""}</pre>
        </details>
        {msg && <p className="notice">{msg}</p>}
        <div className="row bug-actions">
          <button onClick={save}>Save report to file</button>
          <button className="primary" onClick={openIssue}>Open a GitHub issue</button>
        </div>
      </div>
    </div>
  );
}
