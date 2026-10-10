import { describe, expect, it } from "vitest";
import { makeTranslator, translatable } from "./translate";

describe("translation services", () => {
  it("talks to LibreTranslate and reads the answer", async () => {
    let body: any;
    const fake = (async (url: string, init: RequestInit) => {
      expect(url).toBe("https://lt.example/translate");
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ translatedText: body.q.map((t: string) => `${t}!`) }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await makeTranslator({ provider: "libre", url: "https://lt.example/", key: "k" }, fake)(["Hello", "World"], "fr");
    expect(out).toEqual(["Hello!", "World!"]);
    expect(body).toMatchObject({ source: "en", target: "fr", api_key: "k" });
  });

  it("talks to Google Cloud Translation", async () => {
    const fake = (async (url: string) => {
      expect(url).toContain("translation.googleapis.com");
      expect(url).toContain("key=abc");
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: "Hola" }] } }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await makeTranslator({ provider: "google", url: "", key: "abc" }, fake)(["Hello"], "es")).toEqual(["Hola"]);
  });

  it("reports a bad key clearly", async () => {
    const fake = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
    await expect(makeTranslator({ provider: "google", url: "", key: "x" }, fake)(["Hi there"], "es")).rejects.toThrow(/403/);
  });

  it("skips numbers and names it was told to keep", () => {
    const keep = new Set(["Čeněk"]);
    expect(translatable("+3", keep)).toBe(false);
    expect(translatable("Čeněk", keep)).toBe(false);
    expect(translatable("Armor Class", keep)).toBe(true);
  });
});
