// Test helper: loads Aurora element files from a local folder so tests can run against real content.
// The content itself is not part of this repository.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DOMParser as XmlDomParser, XMLSerializer as XmlSer } from "@xmldom/xmldom";
import { parseElementsXml, type XmlApi } from "./parse";
import { ARegistry } from "./registry";

export const nodeXml: XmlApi = {
  parse: (t) => new XmlDomParser().parseFromString(t, "text/xml") as unknown as Document,
  serialize: (n) => new XmlSer().serializeToString(n as never),
};

function walkDir(dir: string, out: string[]): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walkDir(p, out);
    else if (p.endsWith(".xml")) out.push(p);
  }
  return out;
}

export function loadRegistry(dir: string): ARegistry {
  const reg = new ARegistry();
  // Internal files first so content can override them.
  const files = walkDir(dir, []).sort((a, b) => Number(/internal|ALE/.test(b)) - Number(/internal|ALE/.test(a)));
  for (const f of files) reg.addFile(parseElementsXml(readFileSync(f, "utf8"), nodeXml, f));
  reg.build();
  return reg;
}
