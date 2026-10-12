/** Network access that works for sites a web page may not call: through the desktop app's own HTTP client. */
export const isDesktop = (): boolean => typeof window !== "undefined" && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

export async function desktopFetch(): Promise<typeof fetch> {
  if (!isDesktop()) throw new Error("This works in the desktop app only, because the site does not accept requests from a web page.");
  return (await import("@tauri-apps/plugin-http")).fetch as unknown as typeof fetch;
}
