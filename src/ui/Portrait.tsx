import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface PortraitEntry {
  file: string;
  title: string;
  source: string;
  license: string;
}

/** Scales an image down and returns a JPEG data URL, on a parchment ground so transparent art stays readable. */
export function toPortrait(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const size = 256;
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const g = canvas.getContext("2d")!;
      g.fillStyle = "#efe4c8";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Not an image"));
    img.src = url;
  });
}

const base = () => `${import.meta.env.BASE_URL}portraits/`;

/** Public-domain and CC0 portraits that ship with the app. Click one to use it. */
export function PortraitPicker({ onPick }: { onPick: (dataUrl: string) => void }) {
  const [list, setList] = useState<PortraitEntry[]>([]);
  const [hover, setHover] = useState<PortraitEntry | null>(null);
  useEffect(() => {
    fetch(`${base()}index.json`).then((r) => r.json()).then(setList).catch(() => setList([]));
  }, []);
  const pick = async (p: PortraitEntry) => {
    try {
      const blob = await (await fetch(base() + p.file)).blob();
      onPick(await toPortrait(blob));
    } catch {
      /* ignore */
    }
  };
  if (!list.length) return null;
  return (
    <details className="portrait-picker">
      <summary>Choose a stock portrait ({list.length})</summary>
      <div className="portrait-grid">
        {list.map((p) => (
          <button key={p.file} title={p.title} onClick={() => pick(p)} onMouseEnter={() => setHover(p)} onFocus={() => setHover(p)}>
            <img src={base() + p.file} alt={p.title} loading="lazy" />
          </button>
        ))}
      </div>
      <small className="muted">
        {hover ? <>{hover.title} · {hover.license} · <a href={hover.source} target="_blank" rel="noreferrer">source</a></> : "Public domain or CC0 art from Wikimedia Commons and OpenGameArt. Hover a portrait for its source; the link stays here until you hover another."}
      </small>
    </details>
  );
}

/** Crops a square around a chosen face point. `zoom` 1 is the largest square that fits; higher zooms in. */
export function cropAround(img: HTMLImageElement, fx: number, fy: number, zoom: number, size = 256): string {
  const side = Math.min(img.naturalWidth, img.naturalHeight) / zoom;
  const x = Math.min(Math.max(fx * img.naturalWidth - side / 2, 0), img.naturalWidth - side);
  const y = Math.min(Math.max(fy * img.naturalHeight - side / 2, 0), img.naturalHeight - side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#efe4c8";
  g.fillRect(0, 0, size, size);
  g.drawImage(img, x, y, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * After picking an image: drag the square over the face (or click where it should be), set the zoom with the slider
 * or the mouse wheel, see the result. The crop is saved around that point, not the middle of the picture. It opens on
 * the page itself, above any other window.
 */
export function PortraitCropper({ file, onDone, onCancel }: { file: File; onDone: (dataUrl: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [focus, setFocus] = useState<[number, number]>([0.5, 0.4]);
  const [zoom, setZoom] = useState(1.5);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number; inside: boolean } | null>(null);
  // The link is made and revoked by the same effect, so running it twice (React's development mode) stays valid.
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const side = img ? Math.min(img.naturalWidth, img.naturalHeight) / zoom : 0;
  // The centre is kept where the square fits, so a drag never pushes it past the edge and then sticks there.
  const half = img ? [side / 2 / img.naturalWidth, side / 2 / img.naturalHeight] : [0, 0];
  const clamp = (fx: number, fy: number): [number, number] => [Math.min(Math.max(fx, half[0]), 1 - half[0]), Math.min(Math.max(fy, half[1]), 1 - half[1])];
  const [fx, fy] = clamp(focus[0], focus[1]);
  const preview = img ? cropAround(img, fx, fy, zoom, 160) : "";
  const at = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!img) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    // Grabbing the square moves it by the drag; pressing outside it puts it there first.
    const inside = Math.abs(p.x - fx) <= half[0] && Math.abs(p.y - fy) <= half[1];
    if (!inside) setFocus(clamp(p.x, p.y));
    drag.current = { x: p.x, y: p.y, fx: inside ? fx : clamp(p.x, p.y)[0], fy: inside ? fy : clamp(p.x, p.y)[1], inside };
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    setFocus(clamp(d.fx + p.x - d.x, d.fy + p.y - d.y));
  };
  const up = () => { drag.current = null; };
  const wheel = (e: React.WheelEvent) => setZoom((z) => Math.min(5, Math.max(1, Math.round((z - e.deltaY / 500) * 10) / 10)));
  return createPortal(
    <div className="modal-back cropper-back" role="dialog" aria-label="Crop portrait" onClick={onCancel}>
      <div className="modal-page themed cropper" onClick={(e) => e.stopPropagation()}>
        <h2>Crop the portrait</h2>
        <p className="muted">Drag the square over the face. The mouse wheel or the slider zooms.</p>
        <div className="crop-row">
          <div className="crop-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
            {url && <img src={url} alt="The picture to crop" draggable={false} />}
            {img && (
              <span
                className="crop-box"
                style={{ left: `${(fx - half[0]) * 100}%`, top: `${(fy - half[1]) * 100}%`, width: `${half[0] * 200}%`, height: `${half[1] * 200}%` }}
              />
            )}
          </div>
          <div className="crop-side">
            {preview && <img className="portrait-lg" src={preview} alt="Preview" />}
            <label>Zoom <input type="range" min={1} max={5} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
            <div className="row">
              <button className="primary" disabled={!img} onClick={() => img && onDone(cropAround(img, fx, fy, zoom))}>Use this crop</button>
              <button onClick={onCancel}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
