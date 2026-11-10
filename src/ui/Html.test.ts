// @vitest-environment happy-dom
/** Content descriptions are untrusted HTML: nothing that can run or reach outside survives (the audit's H6, X2). */
import { describe, expect, it } from "vitest";
import { sanitize } from "./Html";

const ATTACKS = [
  `<img src=x onerror=alert(1)>`,
  `<p onclick="alert(1)">hi</p>`,
  `<a href="javascript:alert(1)">link</a>`,
  `<a href="https://example.com" target="_blank">out</a>`,
  `<script>alert(1)</script><b>bold</b>`,
  `<svg><script>alert(1)</script></svg>`,
  `<svg onload=alert(1)><circle/></svg>`,
  `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`,
  `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
  `<style>body{display:none}</style><p>x</p>`,
  `<form action="https://example.com"><input name=a><button>go</button></form>`,
  `<template><img src=x onerror=alert(1)></template>`,
  `<object data="x"></object><embed src="x">`,
  `<div style="position:fixed;inset:0;background:red">cover</div>`,
  `<b><i><u onmouseover=alert(1)>deep</u></i></b>`,
  `<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>`,
  `<link rel=stylesheet href="https://example.com/x.css"><meta http-equiv=refresh content="0;url=https://example.com">`,
  `<base href="https://example.com/">`,
];
const ALLOWED = new Set(["P", "DIV", "SPAN", "B", "I", "EM", "STRONG", "U", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "BR", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "CENTER", "SUP", "SUB", "A"]);
const ATTRS = new Set(["class", "colspan", "rowspan"]);

describe("the description filter", () => {
  it("leaves only allowed tags and attributes, whatever comes in", () => {
    for (const html of ATTACKS) {
      const host = document.createElement("div");
      host.innerHTML = sanitize(html);
      for (const node of host.querySelectorAll("*")) {
        expect(ALLOWED.has(node.tagName), `${node.tagName} from ${html}`).toBe(true);
        for (const a of Array.from(node.attributes)) expect(ATTRS.has(a.name), `${a.name} from ${html}`).toBe(true);
      }
    }
  });

  it("keeps the text and the formatting content uses", () => {
    const out = sanitize(`<p class="indent">A <b>bold</b> and <i>slanted</i> word.</p><table><tr><td colspan="2">cell</td></tr></table>`);
    expect(out).toContain("<b>bold</b>");
    expect(out).toContain(`colspan="2"`);
    expect(out).toContain("slanted");
  });

  // The audit's X2: content could wear the app's own class names and draw over the interface.
  it("does not let content use the app's own class names", () => {
    const out = sanitize(`<p class="modal-back crash notice-toast">cover</p><span class="app indent topbar">x</span><p class="indent flavor col-10">ok</p>`);
    expect(out).not.toMatch(/modal-back|crash|notice-toast|topbar|"app/);
    expect(out).toContain("cover");
    expect(out).toContain(`<span class="indent">x</span>`);
    expect(out).toContain(`class="indent flavor col-10"`);
  });
});
