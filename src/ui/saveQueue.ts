/**
 * Saving the open character to the library (docs/AUDIT-2026-11-10.md, S1 and S2). One character waits at a time;
 * it is written a little after the last edit, at once when another character is opened or the window is hidden,
 * and a write that fails stays waiting and is shown, never dropped.
 *
 * Before this, the wait was a timer the next change cleared: opening another character within 0.8 s of an edit
 * dropped that edit, and a failed write was swallowed under a "Saved" mark.
 */
import type { Character } from "../aurora/character";
import type { CharacterRecord } from "../aurora/storage";

export type SaveState = "saved" | "pending" | "saving" | "failed";

/** What the library card shows; worked out when the save is scheduled (it needs the content for the names). */
export interface SaveLabel { name: string; summary: string }

interface Waiting { id: string; character: Character; label: SaveLabel }

export class SaveQueue {
  state: SaveState = "saved";
  /** Why the last write failed, for the player. */
  error = "";
  private waiting?: Waiting;
  private stored?: { id: string; character: Character };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private chain: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    private write: (rec: CharacterRecord) => Promise<void>,
    private delay = 800,
    private now: () => number = Date.now,
  ) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): SaveState => this.state;

  private set(state: SaveState, error = ""): void {
    if (this.state === state && this.error === error) return;
    this.state = state;
    this.error = error;
    for (const fn of this.listeners) fn();
  }

  /** The character as the library has it (just opened from there): nothing to save until it changes. */
  markStored(id: string, character: Character): void {
    this.stored = { id, character };
  }

  /**
   * The open character changed, or another was opened. The same object as last stored is no edit (state is never
   * changed in place). A character of another id that is still waiting is written first.
   */
  schedule(id: string, character: Character, label: SaveLabel): void {
    if (this.waiting && this.waiting.id !== id) void this.flush();
    if (this.stored?.id === id && this.stored.character === character) {
      // Back at what is stored (or opened as stored): an older edit of this character still waiting is the newer one
      // only if it is a different object, and then it was scheduled after this one was stored, so it stays.
      return;
    }
    this.waiting = { id, character, label };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
    if (this.state !== "failed") this.set("pending");
  }

  /** Writes what is waiting now. Resolves when every write started so far has finished, failed or not. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const w = this.waiting;
    if (!w) return this.chain;
    this.waiting = undefined;
    this.set("saving");
    this.chain = this.chain.then(async () => {
      try {
        await this.write({ id: w.id, name: w.label.name, summary: w.label.summary, updated: this.now(), data: w.character });
        this.stored = { id: w.id, character: w.character };
        if (!this.waiting) this.set("saved");
      } catch (e) {
        // Kept for another try, unless a newer edit of the same character is already waiting.
        if (!this.waiting) this.waiting = w;
        this.set("failed", (e as Error)?.message || String(e));
      }
    });
    return this.chain;
  }

  /** Something still to write (a wait or a failed write). */
  get dirty(): boolean {
    return !!this.waiting;
  }
}
