import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Stage D1: the released app carries none of the test bar. The e2e server serves a default, release-flavour build.
test("the release bundle has no test controls", () => {
  const js = readdirSync("dist/assets").filter((f) => f.endsWith(".js")).map((f) => readFileSync(`dist/assets/${f}`, "utf8")).join("\n");
  expect(js).toContain("Soul Forge");
  expect(js).not.toContain("Test controls hidden");
  expect(js).not.toContain("Show test controls");
});
