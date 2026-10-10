import type { ARegistry } from "./registry";

/**
 * Companion stat blocks keep their traits, actions and reactions as lists of element ids.
 * This turns such a value into readable HTML: one paragraph per entry, led by its name.
 */
export function companionHtml(value: string | undefined, reg: ARegistry | undefined): string {
  if (!value) return "";
  const parts = value.split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.some((p) => /^ID_[A-Z0-9_]+$/.test(p))) return value;
  return parts
    .map((p) => {
      if (!/^ID_[A-Z0-9_]+$/.test(p)) return `<p>${p}</p>`;
      const el = reg?.get(p);
      if (!el) return "";
      const body = el.description.replace(/^\s*<p[^>]*>/i, "").replace(/<\/p>\s*$/i, "");
      return `<p><b>${el.name}.</b> ${body}</p>`;
    })
    .join("");
}
