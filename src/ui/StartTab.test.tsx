// @vitest-environment happy-dom
/** Home's character cards wait for the rules content (C1.6): drawn with an empty registry they were gold placeholders. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { newCharacter } from "../aurora/character";

vi.mock("../aurora/storage", () => ({
  listCharacters: async () => [{ id: "a", name: "Ora", summary: "", updated: Date.now(), data: { ...newCharacter(), name: "Ora", classes: [{ classId: "ID_X_CLASS", level: 3 }] } }],
  deleteCharacterRecord: async () => undefined,
}));

describe("Home cards", () => {
  it("are not drawn until the content is ready, then drawn", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { StartTab } = await import("./StartTab");
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    const props = { currentId: "", onOpen: () => undefined, onNew: () => undefined, onRandom: () => undefined, sourceCount: 1, goContent: () => undefined, onImportForeign: async () => "" };
    await act(async () => { root.render(<StartTab {...props} contentReady={false} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(el.querySelectorAll(".char-card")).toHaveLength(0);
    expect(el.textContent).toContain("Loading your characters");
    await act(async () => { root.render(<StartTab {...props} contentReady />); });
    expect(el.querySelectorAll(".char-card")).toHaveLength(1);
    act(() => root.unmount());
  });

  // UX notes of 2026-11-10, bug 12: with its class missing a card read "?" and "HP 0 / -1".
  it("say so when a character's content is not loaded, and show no numbers", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { StartTab } = await import("./StartTab");
    const { ARegistry } = await import("../aurora/registry");
    const reg = new ARegistry();
    reg.build();
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    const props = { currentId: "", onOpen: () => undefined, onNew: () => undefined, onRandom: () => undefined, sourceCount: 1, goContent: () => undefined, onImportForeign: async () => "" };
    await act(async () => { root.render(<StartTab {...props} contentReady reg={reg} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const card = el.querySelector(".char-card")!;
    expect(card.textContent).toContain("Needs content that is not loaded");
    expect(card.querySelector(".char-card-stats")).toBeNull();
    expect(card.textContent).not.toContain("?");
    act(() => root.unmount());
  });
});
