import { describe, expect, it } from "vitest";
import { TabGuard, type Channel } from "./tabGuard";

/** An in-memory stand-in for BroadcastChannel: a message reaches every other member, not the sender. */
function bus() {
  const members: Channel[] = [];
  const make = (): Channel => {
    const ch: Channel = {
      onmessage: null,
      postMessage: (msg) => {
        for (const m of members) if (m !== ch) m.onmessage?.({ data: structuredClone(msg) });
      },
      close: () => {
        members.splice(members.indexOf(ch), 1);
      },
    };
    members.push(ch);
    return ch;
  };
  return make;
}

describe("two windows with the same character (S8)", () => {
  it("the window that opened it last holds it; the other stops saving until it takes it back", () => {
    const make = bus();
    const a = new TabGuard(make());
    const b = new TabGuard(make());
    a.claim("c1");
    expect(a.heldElsewhere).toBe(false);
    b.claim("c1");
    expect(a.heldElsewhere).toBe(true);
    expect(b.heldElsewhere).toBe(false);
    a.claim("c1"); // "Use it here"
    expect(a.heldElsewhere).toBe(false);
    expect(b.heldElsewhere).toBe(true);
  });

  it("different characters in two windows do not touch each other", () => {
    const make = bus();
    const a = new TabGuard(make());
    const b = new TabGuard(make());
    a.claim("c1");
    b.claim("c2");
    expect(a.heldElsewhere).toBe(false);
    expect(b.heldElsewhere).toBe(false);
  });

  it("works without a channel", () => {
    const g = new TabGuard(null);
    g.claim("c1");
    expect(g.heldElsewhere).toBe(false);
  });
});
