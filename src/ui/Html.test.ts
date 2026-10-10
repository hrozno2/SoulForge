// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sanitize } from "./Html";

describe("content HTML sanitizer", () => {
  it("keeps structure, classes and table spans", () => {
    expect(sanitize('<p class="flavor">Hello <b>world</b></p><table><tbody><tr><td colspan="2">x</td></tr></tbody></table>')).toBe('<p class="flavor">Hello <b>world</b></p><table><tbody><tr><td colspan="2">x</td></tr></tbody></table>');
  });
  it("removes event handlers and links that run code", () => {
    expect(sanitize('<p onclick="x()">a</p>')).toBe("<p>a</p>");
    expect(sanitize('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
  });
  it("does not let an unknown wrapper smuggle a dangerous child through", () => {
    for (const html of ['<section><img src=x onerror="window.__pwn=1"></section>', '<foo><bar><img src=x onerror=1></bar></foo>', '<svg><a href="javascript:alert(1)">x</a></svg>', '<form><input onfocus=1 autofocus></form>']) {
      const out = sanitize(html);
      expect(out).not.toMatch(/onerror|onfocus|javascript:|<img|<input|<svg|<form/i);
    }
  });
  it("drops scripts and styles with their content", () => {
    expect(sanitize("<p>a</p><script>alert(1)</script><style>p{}</style>")).toBe("<p>a</p>");
  });
  it("keeps the text of unknown tags", () => {
    expect(sanitize("<section><p>kept</p></section>")).toBe("<p>kept</p>");
  });
});
