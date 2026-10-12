import { defineConfig } from "@playwright/test";

// Runs against the production build served under the same content security policy as the desktop app.
// Locally it uses the Chrome you already have; in CI it uses the Chromium that Playwright installs.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    channel: process.env.CI ? undefined : "chrome",
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    trace: "retain-on-failure",
    // The tutorial opens for everyone until they say never; most tests are about something else.
    storageState: { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "charforge.tutorial", value: "never" }] }] },
  },
  webServer: {
    command: "npm run build && npx vite preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
