import { defineConfig } from "@playwright/test";
import { FIXTURE_ORIGIN, RELEASE_ORIGIN, stored } from "./e2e/helpers";

// Two builds, each served under the same content security policy as the desktop app (stage D7):
// - "release": the released app, which reads no Aurora content. Tests of what ships with it: the free rules, the
//   guide, saving, the rules check, and what the release bundle must not hold.
// - "fixtures": the test build (VITE_FLAVOR=test, its test bar hidden), which still reads Aurora's element files.
//   The fixture rules the other tests build on are in that format.
// Locally the tests use the Chrome you already have; in CI the Chromium that Playwright installs.
const RELEASE = /(flavor|guide|legal|saving|release)\.spec\.ts$/;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    channel: process.env.CI ? undefined : "chrome",
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    trace: "retain-on-failure",
    // The tutorial opens for everyone until they say never; most tests are about something else.
    storageState: stored(),
  },
  projects: [
    { name: "release", testMatch: RELEASE, use: { baseURL: RELEASE_ORIGIN } },
    { name: "fixtures", testIgnore: RELEASE, use: { baseURL: FIXTURE_ORIGIN } },
  ],
  webServer: [
    {
      command: "npm run build && npx vite preview",
      url: RELEASE_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: "npx vite build --outDir dist-test && npx vite preview --outDir dist-test --port 4174",
      env: { VITE_FLAVOR: "test" },
      url: FIXTURE_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
