/**
 * Pips show what is left, filled from the left, so spent ones empty from the right.
 * Clicking an available pip spends it and every one to its right; clicking a spent pip restores up to it.
 */
export function usedAfterClick(total: number, used: number, index: number): number {
  const left = Math.max(0, total - used);
  const nextLeft = index < left ? index : index + 1;
  return Math.max(0, Math.min(total, total - nextLeft));
}

export const isAvailable = (total: number, used: number, index: number): boolean => index < total - used;
