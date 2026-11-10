import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readAuroraUpload, uploadBudget } from "./uploads";

describe("upload limits (the audit's X3)", () => {
  it("an ordinary ZIP of element files is read as before", async () => {
    const zip = new JSZip();
    zip.file("elements-master/core/a.xml", "<elements/>");
    zip.file("elements-master/readme.md", "no");
    const file = new File([(await zip.generateAsync({ type: "uint8array" })) as BlobPart], "elements.zip");
    expect(await readAuroraUpload([file])).toEqual([{ path: "core/a.xml", xml: "<elements/>" }]);
  });

  it("a file that states a size past the limit is refused before it is unpacked", async () => {
    const zip = new JSZip();
    // 2 MB of one letter packs to a few kilobytes.
    zip.file("x/big.xml", "a".repeat(2 * 1024 * 1024));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    expect(bytes.length).toBeLessThan(20_000);
    const budget = uploadBudget({ files: 10, fileBytes: 1024 * 1024, totalBytes: 10 * 1024 * 1024 });
    const loaded = await JSZip.loadAsync(bytes);
    const stated = (loaded.files["x/big.xml"] as unknown as { _data: { uncompressedSize: number } })._data.uncompressedSize;
    expect(stated).toBe(2 * 1024 * 1024);
    expect(() => budget.declared("x/big.xml", stated)).toThrow(/more than the 1 MB/);
  });

  it("stops at too many files and at too much in all, in words", () => {
    const few = uploadBudget({ files: 2, fileBytes: 100, totalBytes: 1000 });
    few.took("a", 1);
    few.took("b", 1);
    expect(() => few.took("c", 1)).toThrow(/more than 2 files/);
    const small = uploadBudget({ files: 10, fileBytes: 600 * 1024 * 1024, totalBytes: 1024 * 1024 });
    small.took("a", 800 * 1024);
    expect(() => small.took("b", 800 * 1024)).toThrow(/unpacks to more than 1 MB/);
  });
});
