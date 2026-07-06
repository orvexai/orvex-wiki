import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the orvex-wiki client smoke suite.
 *
 * The server is NOT started here. The foundation runs the built engine via
 * `make run-local` (Postgres + Redis + MinIO + engine at APP_URL); Playwright
 * only drives a browser against that already-running instance. Hence there is
 * deliberately NO `webServer` block.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
