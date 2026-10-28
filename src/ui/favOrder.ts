/**
 * The order of the favorites row (C2): a new favorite goes in where it is dropped, and a favorite dragged within the
 * row (or moved with its buttons) goes to its new place. `at` is the gap before the item of that index (the length
 * of the list for the end).
 */
export function insertAt<T>(list: T[], item: T, at: number): T[] {
  const i = Math.max(0, Math.min(list.length, at));
  return [...list.slice(0, i), item, ...list.slice(i)];
}

/** Moves the item with this uid to the gap `at` (counted in the list as it is, before the move). */
export function moveTo<T extends { uid: string }>(list: T[], uid: string, at: number): T[] {
  const from = list.findIndex((x) => x.uid === uid);
  if (from < 0) return list;
  const item = list[from];
  const rest = list.filter((_, i) => i !== from);
  return insertAt(rest, item, at > from ? at - 1 : at);
}
