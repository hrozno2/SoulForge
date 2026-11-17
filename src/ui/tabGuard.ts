/**
 * Two windows on one library (docs/AUDIT-2026-11-10.md, S8). The desktop app runs once (the single-instance plugin
 * brings the open window forward), but the web build can be open in two tabs, and both would autosave the same
 * character, the last write winning. Each window says on a shared channel which character it has open; the window
 * that opened it last holds it, and any other window with the same character stops saving it and says so, until its
 * player chooses "Use it here", which takes it back.
 */

export interface Channel {
  postMessage(msg: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}

interface Claim {
  kind: "claim";
  window: string;
  character: string;
}

const isClaim = (m: unknown): m is Claim =>
  !!m &&
  typeof m === "object" &&
  (m as Claim).kind === "claim" &&
  typeof (m as Claim).window === "string" &&
  typeof (m as Claim).character === "string";

export class TabGuard {
  /** The open character is held by another window: this one does not save it. */
  heldElsewhere = false;
  private current = "";
  private readonly self = Math.random().toString(36).slice(2) + Date.now().toString(36);
  private listeners = new Set<() => void>();

  private channel: Channel | null = null;

  /**
   * `open` makes the channel; it is opened when first needed and again after `close`, so a component that closes it on
   * unmount and mounts again (React's development mode runs every effect twice) keeps working.
   */
  constructor(private open: () => Channel | null) {}

  private ch(): Channel | null {
    if (!this.channel) {
      this.channel = this.open();
      if (this.channel)
        this.channel.onmessage = (e) => {
          if (!isClaim(e.data) || e.data.window === this.self) return;
          if (e.data.character === this.current && this.current) this.set(true);
        };
    }
    return this.channel;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getHeld = (): boolean => this.heldElsewhere;

  private set(v: boolean): void {
    if (this.heldElsewhere === v) return;
    this.heldElsewhere = v;
    for (const fn of this.listeners) fn();
  }

  /** This window opened a character (or the player chose "Use it here"): it holds it now. */
  claim(character: string): void {
    this.current = character;
    this.set(false);
    try {
      this.ch()?.postMessage({ kind: "claim", window: this.self, character } satisfies Claim);
    } catch {
      // A closed or broken channel: this window simply does not announce; saving is never stopped by it.
    }
  }

  close(): void {
    this.channel?.close();
    this.channel = null;
  }
}

/** The browser's channel, where there is one (not in older web views or tests). */
export function browserChannel(name = "soulforge"): Channel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : (new BroadcastChannel(name) as unknown as Channel);
  } catch {
    return null;
  }
}
