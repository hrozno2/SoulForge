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
          <button key={p.file} title={p.title} onClick={() => pick(p)} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p)}>
            <img src={base() + p.file} alt={p.title} loading="lazy" />
          </button>
        ))}
      </div>
      <small className="muted">
        {hover ? <>{hover.title} · {hover.license} · <a href={hover.source} target="_blank" rel="noreferrer">source</a></> : "Public domain or CC0 art from Wikimedia Commons and OpenGameArt. Hover for the source."}
      </small>
    </details>
  );
}
