import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { rollAudit, withHpRoll } from "./hpRolls";

describe("hit point rolls", () => {
  it("keeps each roll with who made it, within the die, and removes both together", () => {
    let c = withHpRoll(newCharacter(), 2, 9, "app", 8, 1);
    expect(c.hpRolls["2"]).toBe(8);
    expect(c.hpRollLog?.["2"]).toEqual({ value: 8, die: 8, by: "app", at: 1 });
    expect(c.hpMode).toBe("roll");
    c = withHpRoll(c, 3, 5, "player", 10, 2);
    expect(c.hpRollLog?.["3"]?.by).toBe("player");
    c = withHpRoll(c, 2, undefined, "player", 8);
    expect(c.hpRolls["2"]).toBeUndefined();
    expect(c.hpRollLog?.["2"]).toBeUndefined();
  });

  it("checks only Soul Forge's rolls: their average against the dice, faces counted, anything out of range", () => {
    const c = { ...newCharacter(), hpRollLog: { "2": { value: 1, die: 8, by: "app" as const }, "3": { value: 8, die: 8, by: "app" as const }, "4": { value: 12, die: 8, by: "app" as const }, "5": { value: 6, die: 10, by: "player" as const } } };
    const a = rollAudit([c]);
    expect(a.count).toBe(3);
    expect(a.expected).toBe(4.5);
    expect(a.mean).toBe(7);
    expect(a.outOfRange).toBe(1);
    expect(a.faces[8][0]).toBe(1);
    expect(a.faces[8][7]).toBe(1);
  });

  it("finds the app's rolls fair over many rolls", () => {
    const log: Record<string, { value: number; die: number; by: "app" }> = {};
    for (let i = 0; i < 6000; i++) log[String(i)] = { value: 1 + Math.floor(Math.random() * 10), die: 10, by: "app" };
    const a = rollAudit([{ ...newCharacter(), hpRollLog: log }]);
    expect(Math.abs(a.mean - 5.5)).toBeLessThan(0.15);
    for (const n of a.faces[10]) expect(Math.abs(n - 600)).toBeLessThan(110);
  });
});
