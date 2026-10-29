/**
 * Things flying into the spellbook and the backpack (C6.6, Chris 2026-10-28): a chosen spell goes into the book as a
 * page, bought or added gear into the pack. One flight for every place that adds something: from what was pressed
 * (the last pointer press, so no handler has to pass its event) to the book or pack, in the open window when there
 * is one, else on the board. Transform and opacity only; nothing with reduce motion.
 */
let lastPress: Element | null = null;
if (typeof document !== "undefined") document.addEventListener("pointerdown", (e) => { lastPress = e.target as Element; }, true);

const reduced = () => document.documentElement.classList.contains("reduce-motion");
const TARGET = {
  spellbook: [".card-window-magic .card-back-art svg", "[data-tile=magic]"],
  // Into the Inventory's backpack, not the starting gear (C7.13).
  backpack: [".card-window-equipment .inv-pack svg", "[data-tile=equipment]"],
};

export function flyInto(to: keyof typeof TARGET, from: Element | null = lastPress): void {
  if (!from || reduced() || typeof document.body.animate !== "function") return;
  const src = (from.closest(".scroll-card, .opt-row, .equip-card, .pick-card, li") ?? from).getBoundingClientRect();
  const dest = TARGET[to].map((q) => document.querySelector(q)).find((e) => e && e.getBoundingClientRect().width > 0)?.getBoundingClientRect();
  if (!dest || !src.width) return;
  const token = document.createElement("div");
  token.className = `flight flight-${to}`;
  Object.assign(token.style, { left: `${src.left}px`, top: `${src.top}px`, width: `${src.width}px`, height: `${src.height}px` });
  document.body.appendChild(token);
  const dx = dest.left + dest.width / 2 - (src.left + src.width / 2), dy = dest.top + dest.height / 2 - (src.top + src.height / 2);
  const s = Math.max(0.08, Math.min(dest.width / src.width, dest.height / src.height) * 0.6);
  token.animate(
    [{ transform: "none", opacity: 0.95 }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(1 + s) / 2}) rotate(-6deg)`, opacity: 0.9, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.2 }],
    { duration: 420, easing: "cubic-bezier(.3,.7,.3,1)" },
  ).finished.finally(() => token.remove());
}
