import { useEffect, useRef, useState, type ReactNode } from "react";

const MS = 180;
const reduced = () => document.documentElement.classList.contains("reduce-motion");

/**
 * A body that folds and unfolds with a short slide (C6.4, Chris 2026-10-28: after the cantrips, the list jumped to the
 * 1st-level spells and the change went unseen). The height eases to and from nothing, so everything below moves with
 * it; with reduce motion it appears and disappears at once. Its children stay mounted only while it is open or folding.
 */
export function Fold({ open, children, className = "" }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open);
  const [shut, setShut] = useState(!open);
  // Settled open: nothing clipped (sticky headers and pop-ups inside work as anywhere else).
  const [settled, setSettled] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduced()) { setShut(false); setSettled(true); return; }
      let t = 0;
      const f = requestAnimationFrame(() => requestAnimationFrame(() => { setShut(false); t = window.setTimeout(() => setSettled(true), MS); }));
      return () => { cancelAnimationFrame(f); window.clearTimeout(t); };
    }
    setSettled(false);
    setShut(true);
    if (reduced()) { setMounted(false); return; }
    const t = window.setTimeout(() => setMounted(false), MS);
    return () => window.clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return <div className={`fold ${shut ? "shut" : ""} ${settled ? "settled" : ""} ${className}`}><div className="fold-inner">{children}</div></div>;
}

/** Scrolls an element's top into view after a fold, smoothly unless motion is reduced. */
export function useScrollOnFold<T extends HTMLElement>(folded: boolean) {
  const ref = useRef<T>(null);
  const was = useRef(folded);
  useEffect(() => {
    if (folded && !was.current) window.setTimeout(() => ref.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" }), MS);
    was.current = folded;
  }, [folded]);
  return ref;
}
