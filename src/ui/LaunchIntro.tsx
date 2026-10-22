import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The launch intro, once per app start: a card pack with the Soul Forge mark drops in and shimmers while the app
 * loads (the rules content, the saved characters and their sheets). When the home screen has drawn the finished
 * character cards, the pack bursts open in a flash of light rays, the way a Hearthstone pack opens, and those cards
 * fly out of it onto their places, turning face up as they land, each with a glow by level like a card's rarity
 * (common, rare, epic, legendary). The cards that land are final: nothing changes on them afterwards.
 *
 * The app's own Reduce motion setting turns it off (the system's reduced-motion preference does not: the user wants
 * the intro with it on); a click skips it. The animation is all CSS on transform and opacity, so it stays smooth while
 * the content loads on the main thread. It covers the window and centres the pack whatever the interface scale (the app
 * zooms the page), and the cards fly from where the pack actually is on screen.
 */
let played = false;
let dropWaiting = false;
let markReady: () => void = () => undefined;
const ready = new Promise<void>((done) => { markReady = done; });

const reduced = () => document.documentElement.classList.contains("reduce-motion");

/** The home screen calls this when its cards are drawn with everything on them (the app, when Home is not shown). */
export function launchReady(): void {
  markReady();
}

/** A card's rarity by the character's level, for the colour of its landing glow. */
const rarityOf = (level: number) => (level >= 17 ? "legendary" : level >= 11 ? "epic" : level >= 5 ? "rare" : "common");

/** Where the pack burst, in screen coordinates (set at the burst). */
let burstAt: { x: number; y: number } | null = null;

/**
 * Flies the home screen's character cards out of the burst point to their places. Distances are measured on screen
 * and turned into the cards' own units (the page may be zoomed), so they leave from the pack wherever it is.
 */
function dropCards(): boolean {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".char-cards > .char-card"));
  if (!cards.length) return false;
  const from = burstAt ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  cards.forEach((card, i) => {
    const r = card.getBoundingClientRect();
    if (r.top > window.innerHeight || r.width === 0) return; // below the fold: nothing to see
    const unit = r.width / (card.offsetWidth || r.width); // screen pixels per CSS pixel of the card
    const dx = (from.x - (r.left + r.width / 2)) / unit, dy = (from.y - (r.top + r.height / 2)) / unit;
    card.dataset.rarity = rarityOf(Number(card.dataset.level) || 0);
    card.classList.add("loot-drop");
    const tilt = (i % 2 ? 1 : -1) * (8 + (i % 3) * 4);
    card.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(.25) rotateY(180deg) rotate(${tilt}deg)`, opacity: 0, offset: 0 },
        { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 60}px) scale(.9) rotateY(90deg) rotate(${tilt / 2}deg)`, opacity: 1, offset: 0.55 },
        { transform: "translate(0, -6px) scale(1.04) rotateY(0deg) rotate(0deg)", offset: 0.85 },
        { transform: "none", opacity: 1, offset: 1 },
      ],
      { duration: 720, delay: i * 80, easing: "cubic-bezier(.2,.8,.25,1)", fill: "backwards" },
    ).onfinish = () => { window.setTimeout(() => card.classList.remove("loot-drop"), 900); };
  });
  return true;
}

/** For the home screen: drop the cards if the pack burst before they were there. */
export function dropCardsIfWaiting(): void {
  if (dropWaiting && dropCards()) dropWaiting = false;
}

/** `onDone` runs when the intro is over (at once when it does not play), so the tutorial opens after it. */
export function LaunchIntro({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<"shimmer" | "burst" | "out" | "done">(() => (played || reduced() ? "done" : "shimmer"));
  useEffect(() => { if (phase === "done") onDone?.(); }, [phase, onDone]);
  useEffect(() => {
    if (phase === "done") return;
    played = true;
    let stop = false;
    const timers: number[] = [];
    const skip = () => { stop = true; setPhase("done"); };
    window.addEventListener("pointerdown", skip, { once: true });
    // At least the drop and a moment of shimmer; at most 6 s, so the app is in use within the launch budget even on
    // the one slow launch after an update or a new import (the content then finishes behind the open home screen).
    const atLeast = new Promise<void>((done) => timers.push(window.setTimeout(done, 1300)));
    const atMost = new Promise<void>((done) => timers.push(window.setTimeout(done, 6000)));
    void Promise.all([atLeast, Promise.race([ready, atMost])]).then(() => {
      if (stop) return;
      const pack = document.querySelector(".launch-pack")?.getBoundingClientRect();
      burstAt = pack ? { x: pack.left + pack.width / 2, y: pack.top + pack.height / 2 } : null;
      setPhase("burst");
      timers.push(window.setTimeout(() => {
        if (!dropCards()) { dropWaiting = true; timers.push(window.setTimeout(() => { dropWaiting = false; }, 4000)); }
        setPhase("out");
      }, 300));
      timers.push(window.setTimeout(() => setPhase("done"), 950));
    });
    return () => { stop = true; window.removeEventListener("pointerdown", skip); timers.forEach((t) => window.clearTimeout(t)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (phase === "done") return null;
  return createPortal(
    <div className={`launch-intro ${phase}`} aria-hidden="true">
      <div className="launch-rays" />
      <div className="launch-pack">
        <div className="launch-pack-glow" />
        <svg viewBox="0 0 200 280" className="launch-pack-art">
          <defs>
            <linearGradient id="lp-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a2416" /><stop offset="1" stopColor="#140c08" /></linearGradient>
            <linearGradient id="lp-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f1d98f" /><stop offset="1" stopColor="#b8903a" /></linearGradient>
            <linearGradient id="lp-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#8e1119" /><stop offset=".55" stopColor="#e03a2f" /><stop offset="1" stopColor="#ffb347" /></linearGradient>
          </defs>
          <path d="M18 22 Q100 6 182 22 L188 262 Q100 276 12 262 Z" fill="url(#lp-body)" stroke="url(#lp-gold)" strokeWidth="5" />
          <path d="M14 46 Q100 32 186 46" fill="none" stroke="url(#lp-gold)" strokeWidth="3" opacity=".8" />
          <path d="M12 238 Q100 252 188 238" fill="none" stroke="url(#lp-gold)" strokeWidth="3" opacity=".8" />
          <g transform="translate(100 140) scale(.42) translate(-256 -256)">
            <path d="M256 54 429 154v204L256 458 83 358V154z" fill="none" stroke="url(#lp-gold)" strokeWidth="14" strokeLinejoin="round" />
            <path d="M256 128c14 52 70 82 70 150 0 44-31 78-70 78s-70-34-70-78c0-34 18-52 32-72 4 22 14 34 26 38-8-40 0-82 12-116z" fill="url(#lp-flame)" />
            <path d="M256 236c8 26 34 40 34 72 0 22-15 38-34 38s-34-16-34-38c0-18 10-28 18-40 2 12 8 18 14 20-4-20-2-36 2-52z" fill="#ffd9a0" opacity=".85" />
            <path d="M196 368h120l-10 24H206z" fill="url(#lp-gold)" />
          </g>
        </svg>
        <div className="launch-pack-shine" />
      </div>
      <div className="launch-flash" />
    </div>,
    document.body,
  );
}
