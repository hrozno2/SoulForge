import { useEffect, useState } from "react";

/**
 * The launch intro, about two seconds, once per app start: a card pack with the Soul Forge mark drops in, shakes
 * while its glow builds, and bursts open in a flash of light rays, the way a Hearthstone pack opens. The saved
 * characters then fly out of the pack onto their places on the home screen, turning face up as they land, each with
 * a glow by level like a card's rarity (common, rare, epic, legendary). The app's own Reduce motion setting turns it
 * off (the system's reduced-motion preference does not: the user wants the intro with it on); a click skips it.
 */
let played = false;
let dropWaiting = false;

const reduced = () => document.documentElement.classList.contains("reduce-motion");

/** A card's rarity by the character's level, for the colour of its landing glow. */
const rarityOf = (level: number) => (level >= 17 ? "legendary" : level >= 11 ? "epic" : level >= 5 ? "rare" : "common");

/**
 * Flies the home screen's character cards out of the screen's centre (the burst pack) to their places. Called at the
 * burst; when the home screen has no cards yet (content still loading), the first cards to appear take it instead.
 */
function dropCards(): boolean {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".char-cards > .char-card"));
  if (!cards.length) return false;
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  cards.forEach((card, i) => {
    const r = card.getBoundingClientRect();
    if (r.top > window.innerHeight) return; // below the fold: nothing to see
    const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
    const level = Number(card.dataset.level) || 0;
    card.dataset.rarity = rarityOf(level);
    card.classList.add("loot-drop");
    const tilt = (i % 2 ? 1 : -1) * (8 + (i % 3) * 4);
    card.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(.25) rotateY(180deg) rotate(${tilt}deg)`, opacity: 0, offset: 0 },
        { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 60}px) scale(.9) rotateY(90deg) rotate(${tilt / 2}deg)`, opacity: 1, offset: 0.55 },
        { transform: "translate(0, -6px) scale(1.04) rotateY(0deg) rotate(0deg)", offset: 0.85 },
        { transform: "none", opacity: 1, offset: 1 },
      ],
      { duration: 720, delay: i * 90, easing: "cubic-bezier(.2,.8,.25,1)", fill: "backwards" },
    ).onfinish = () => { window.setTimeout(() => card.classList.remove("loot-drop"), 900); };
  });
  return true;
}

/** For the home screen: drop the cards if the intro burst before they were there. */
export function dropCardsIfWaiting(): void {
  if (dropWaiting && dropCards()) dropWaiting = false;
}

let finishIntro: () => void = () => undefined;
const introOver = new Promise<void>((done) => { finishIntro = done; });

/**
 * Waits for the intro to end (at once when it does not play), at most 3 seconds. The rules content is read after it,
 * so its seconds of work do not stall the animation.
 */
export function whenIntroOver(): Promise<void> {
  return Promise.race([introOver, new Promise<void>((done) => window.setTimeout(done, 3000))]);
}

/**
 * `onDone` runs when the intro is over (at once when it does not play), so the tutorial opens after it. The timing is
 * all in the CSS (each part's animation and delay), which the browser runs off the main thread; the timers here only
 * drop the cards at the burst and remove the layer at the end.
 */
export function LaunchIntro({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<"play" | "done">(() => (played || reduced() ? "done" : "play"));
  useEffect(() => { if (phase === "done") { finishIntro(); onDone?.(); } }, [phase, onDone]);
  useEffect(() => {
    if (phase === "done") return;
    played = true;
    const skip = () => setPhase("done");
    window.addEventListener("pointerdown", skip, { once: true });
    const t1 = window.setTimeout(() => { if (!dropCards()) { dropWaiting = true; window.setTimeout(() => { dropWaiting = false; }, 4000); } }, 1350);
    const t2 = window.setTimeout(() => setPhase("done"), 2000);
    return () => { window.removeEventListener("pointerdown", skip); window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (phase === "done") return null;
  return (
    <div className="launch-intro" aria-hidden="true">
      <div className="launch-rays" />
      <div className="launch-pack">
        <div className="launch-pack-glow" />
        <svg viewBox="0 0 200 280" className="launch-pack-art">
          <defs>
            <linearGradient id="lp-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2416" /><stop offset="1" stop-color="#140c08" /></linearGradient>
            <linearGradient id="lp-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1d98f" /><stop offset="1" stop-color="#b8903a" /></linearGradient>
            <linearGradient id="lp-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#8e1119" /><stop offset=".55" stop-color="#e03a2f" /><stop offset="1" stop-color="#ffb347" /></linearGradient>
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
      </div>
      <div className="launch-flash" />
    </div>
  );
}
