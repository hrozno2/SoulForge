// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./ErrorBoundary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Broken({ on }: { on: boolean }): never | null {
  if (on) throw new Error("the sheet could not be built");
  return null;
}

describe("a screen that throws", () => {
  afterEach(() => vi.restoreAllMocks());

  // The audit's S7: one throw while drawing blanked the whole window.
  it("shows what happened and keeps the rest of the page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<div><p id="around">still here</p><ErrorBoundary scope="Play"><Broken on /></ErrorBoundary></div>));
    expect(host.querySelector("#around")?.textContent).toBe("still here");
    expect(host.querySelector("[role=alert]")?.textContent).toContain("Play could not be shown");
    expect(host.textContent).toContain("the sheet could not be built");
    expect(host.textContent).not.toContain("Start without the open character");
    await act(async () => root.unmount());
  });

  it("the whole-app boundary offers to start without the open character", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<ErrorBoundary scope="The app" whole><Broken on /></ErrorBoundary>));
    expect(host.textContent).toContain("Start without the open character");
    await act(async () => root.unmount());
  });
});
