/**
 * An in-app confirmation dialog for destructive actions. The browser's own confirm() is not reliable in the desktop
 * app's web view, so deletions ask through this instead: `await askConfirm({ ... })` resolves true on the confirm
 * button and false on Cancel, Escape or a click outside. <ConfirmHost /> is mounted once in the app.
 */
import { useEffect, useState } from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let show: ((p: Pending) => void) | null = null;

export function askConfirm(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ ...o, resolve });
    else resolve(window.confirm(o.title)); // no host mounted (tests): fall back to the browser's own
  });
}

export function ConfirmHost() {
  const [p, setP] = useState<Pending | null>(null);
  useEffect(() => {
    show = setP;
    return () => { show = null; };
  }, []);
  useEffect(() => {
    if (!p) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); if (e.key === "Enter") close(true); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (!p) return null;
  const close = (ok: boolean) => { p.resolve(ok); setP(null); };
  return (
    <div className="modal-back" onClick={() => close(false)}>
      <div className="modal-page themed confirm-box" role="alertdialog" aria-modal="true" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <h2>{p.title}</h2>
        {p.message && <p>{p.message}</p>}
        <div className="row confirm-actions">
          <button autoFocus onClick={() => close(false)}>Cancel</button>
          <button className="danger" onClick={() => close(true)}>{p.confirmLabel ?? "Delete"}</button>
        </div>
      </div>
    </div>
  );
}
