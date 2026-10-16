import { describe, expect, it } from "vitest";
import { makeTranslator, translatable, translateAll } from "./translate";

describe("translation services", () => {
  it("uses the free Google endpoint, joins sentence segments, and keeps the order", async () => {
    const fake = (async (_url: string, init: RequestInit) => {
      const q = decodeURIComponent(String(init.body).replace(/^q=/, ""));
      return new Response(JSON.stringify([[[`<${q.slice(0, 3)}`, q], [">", ""]]]), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await makeTranslator({ provider: "gfree", url: "", key: "" }, fake)(["Alpha", "Bravo", "Charlie", "Delta"], "fr");
    expect(out).toEqual(["<Alp>", "<Bra>", "<Cha>", "<Del>"]);
  });

  it("explains a rate limit", async () => {
    const fake = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    await expect(makeTranslator({ provider: "gfree", url: "", key: "" }, fake)(["Hello there"], "fr")).rejects.toThrow(/limiting/);
  });

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

  it("retries the strings of a failed batch one at a time", async () => {
    const strings = Array.from({ length: 45 }, (_, i) => `word number ${i}`);
    let batch = 0;
    const translator = async (texts: string[]) => {
      batch++;
      if (batch === 2) throw new Error("busy"); // the second whole batch fails, single strings work
      return texts.map((t) => `<${t}>`);
    };
    const cache = { get: async () => undefined, put: async () => undefined };
    const { map, failed } = await translateAll(strings, "fr", translator, cache);
    expect(failed).toBe(0);
    expect(map.size).toBe(45);
  });

  it("DeepL: uses the free address for a :fx key, sends the terms as a glossary, and asks for the right language", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/v2/glossaries")) return new Response(JSON.stringify({ glossary_id: "g-1" }), { status: 201 });
      const body = JSON.parse(String(init.body)) as { text: string[] };
      return new Response(JSON.stringify({ translations: body.text.map((t) => ({ text: `<${t}>` })) }), { status: 200 });
    }) as unknown as typeof fetch;
    const tr = makeTranslator({ provider: "deepl", key: "abc:fx", url: "" }, fake, { quarterstaff: "Palica" });
    expect(await tr(["Hello there"], "sk")).toEqual(["<Hello there>"]);
    expect(calls[0].url).toBe("https://api-free.deepl.com/v2/glossaries");
    expect(String(calls[0].init.body)).toContain("quarterstaff\\tPalica");
    const sent = JSON.parse(String(calls[1].init.body));
    expect(sent).toMatchObject({ target_lang: "SK", source_lang: "EN", glossary_id: "g-1" });
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("DeepL-Auth-Key abc:fx");
  });

  it("DeepL: says so when the allowance is used up or the key is refused", async () => {
    const make = (status: number) => makeTranslator({ provider: "deepl", key: "k", url: "" }, (async () => new Response("{}", { status })) as unknown as typeof fetch);
    await expect(make(456)(["a"], "de")).rejects.toThrow(/allowance/);
    await expect(make(403)(["a"], "de")).rejects.toThrow(/key/);
  });
});

describe("DeepSeek translation", () => {
  it("asks for one translation per string, with the player's terms, and reads them back in order", async () => {
    let sent: { headers: Record<string, string>; body: { messages: { role: string; content: string }[] } } | undefined;
    const fake = (async (_url: string, init: RequestInit) => {
      sent = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ t: ["Pobočný meč", "Lukostreľba"] }) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const tr = makeTranslator({ provider: "deepseek", key: "sk-test", url: "" }, fake, { Shortsword: "Krátky meč" });
    expect(await tr(["Shortsword", "Archery"], "sk")).toEqual(["Pobočný meč", "Lukostreľba"]);
    expect(sent!.headers.Authorization).toBe("Bearer sk-test");
    expect(sent!.body.messages[0].content).toContain("Shortsword = Krátky meč");
    expect(JSON.parse(sent!.body.messages[1].content)).toEqual(["Shortsword", "Archery"]);
  });
  it("says so when the answer does not match what was sent", async () => {
    const fake = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"t":["one"]}' } }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(makeTranslator({ provider: "deepseek", key: "k", url: "" }, fake)(["a", "b"], "de")).rejects.toThrow(/did not match/);
  });
});
