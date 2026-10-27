import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

/** After this long without typing, the text goes to the character. */
const IDLE_MS = 300;

/**
 * A text field that keeps its own text while the player types and hands it on after a pause, on leaving the field
 * and when it goes away (C1.0). A character's text (its name, notes, backstory) feeds nothing the engine reads, but
 * each change re-drew every card on the board, about 40 ms a keystroke; now a word costs one re-draw.
 */
function useCommitted(value: string, commit: (v: string) => void) {
  const [text, setText] = useState(value);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current !== null) { const v = pending.current; pending.current = null; commitRef.current(v); }
  };
  // Text changed elsewhere (another field for the same thing, an import, undo) shows here unless typing is under way.
  useEffect(() => { if (pending.current === null) setText(value); }, [value]);
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (v: string) => {
    setText(v);
    pending.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, IDLE_MS);
  };
  return { text, change, flush };
}

type Common = { value: string; onCommit: (v: string) => void };

export function TextInput({ value, onCommit, onBlur, ...rest }: Common & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const f = useCommitted(value, onCommit);
  return <input {...rest} value={f.text} onChange={(e) => f.change(e.target.value)} onBlur={(e) => { f.flush(); onBlur?.(e); }} />;
}

export function TextArea({ value, onCommit, onBlur, ...rest }: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const f = useCommitted(value, onCommit);
  return <textarea {...rest} value={f.text} onChange={(e) => f.change(e.target.value)} onBlur={(e) => { f.flush(); onBlur?.(e); }} />;
}
