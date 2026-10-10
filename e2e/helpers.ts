import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

const HOST = "https://fixtures.soulforge.test/";

/** Serves the test ruleset from the repository for the fake host the demo index points at. */
export async function serveFixtures(page: Page): Promise<void> {
  await page.route(`${HOST}**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, "");
    try {
      const body = readFileSync(join("fixtures", path === "demo.index" ? "demo.index" : path));
      await route.fulfill({ status: 200, contentType: path.endsWith(".xml") || path.endsWith(".index") ? "application/xml" : "text/plain", body, headers: { "access-control-allow-origin": "*" } });
    } catch {
      await route.fulfill({ status: 404, body: "not found" });
    }
  });
}

/** Counts security policy violations and page errors, so a test can fail on them. */
export function watchProblems(page: Page): { csp: string[]; errors: string[] } {
  const seen = { csp: [] as string[], errors: [] as string[] };
  page.on("pageerror", (e) => seen.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /Content.Security.Policy|violates/i.test(m.text())) seen.csp.push(m.text().slice(0, 200));
  });
  return seen;
}

export async function tab(page: Page, name: string): Promise<void> {
  const nav = page.locator("header nav");
  const direct = nav.getByRole("button", { name: new RegExp(`^${name}`) });
  if (await direct.count()) await direct.first().click();
  else {
    await nav.getByRole("button", { name: /more/i }).click();
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  }
}

/** Adds the test content through the Content tab and waits for it to load. */
export async function addTestContent(page: Page): Promise<void> {
  await serveFixtures(page);
  await page.goto("/");
  await tab(page, "Content");
  await page.getByPlaceholder("https://.../something.index").fill(`${HOST}demo.index`);
  await page.getByRole("button", { name: /add link/i }).first().click();
  await tab(page, "Home");
  await expect(page.getByRole("button", { name: /random character/i })).toBeEnabled({ timeout: 30_000 });
  // The registry builds after the files arrive.
  await page.waitForFunction(() => !document.querySelector(".busy"), null, { timeout: 30_000 });
}
