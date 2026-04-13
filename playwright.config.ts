import { defineConfig, devices } from "@playwright/test";

const isCoverageRun = !!process.env.PW_E2E_COVERAGE;
const appPort = isCoverageRun ? 4100 : 4000;
const appUrl = `http://localhost:${appPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["line"],
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["./tests/e2e/reporters/ordered-screenshots-reporter.ts", { outputDir: "test-results/ordered-screenshots" }],
  ],
  preserveOutput: "always",
  use: {
    baseURL: appUrl,
    trace: "on",
    screenshot: "on",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: isCoverageRun
      ? `cross-env VITE_COVERAGE=true NODE_ENV=test npm run dev -- --port=${appPort}`
      : "npm run dev",
    url: appUrl,
    reuseExistingServer: !process.env.CI,
  },
});
