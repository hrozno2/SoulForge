import { useEffect, useState } from "react";

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

/** After picking an image: click the face, set the zoom, see the result. The crop is saved around the face, not the middle of the picture. */
export function PortraitCropper({ file, onDone, onCancel }: { file: File; onDone: (dataUrl: string) => void; onCancel: () => void }) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [focus, setFocus] = useState<[number, number]>([0.5, 0.4]);
  const [zoom, setZoom] = useState(1.5);
  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  const preview = img ? cropAround(img, focus[0], focus[1], zoom, 160) : "";
  const side = img ? Math.min(img.naturalWidth, img.naturalHeight) / zoom : 0;
  return (
    <div className="modal-back" role="dialog" aria-label="Crop portrait" onClick={onCancel}>
      <div className="modal-page cropper" onClick={(e) => e.stopPropagation()}>
        <h2>Crop the portrait</h2>
        <p className="muted">Click the face. Soul Forge crops around it instead of the middle of the picture.</p>
        <div className="crop-row">
          <div className="crop-stage">
            <img
              src={url}
              alt="Click the face"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setFocus([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
              }}
            />
            {img && (
              <span
                className="crop-box"
                style={{
                  left: `${(Math.min(Math.max(focus[0] * img.naturalWidth - side / 2, 0), img.naturalWidth - side) / img.naturalWidth) * 100}%`,
                  top: `${(Math.min(Math.max(focus[1] * img.naturalHeight - side / 2, 0), img.naturalHeight - side) / img.naturalHeight) * 100}%`,
                  width: `${(side / img.naturalWidth) * 100}%`,
                  height: `${(side / img.naturalHeight) * 100}%`,
                }}
              />
            )}
          </div>
          <div className="crop-side">
            {preview && <img className="portrait-lg" src={preview} alt="Preview" />}
            <label>Zoom <input type="range" min={1} max={5} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
            <div className="row">
              <button className="primary" disabled={!img} onClick={() => img && onDone(cropAround(img, focus[0], focus[1], zoom))}>Use this crop</button>
              <button onClick={onCancel}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
