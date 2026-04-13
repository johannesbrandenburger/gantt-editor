import { defineConfig, devices } from "@playwright/test";

const isCoverageRun = !!process.env.PW_E2E_COVERAGE;

const frameworkServers = [
  {
    name: "vue",
    port: 4000,
    command: isCoverageRun
      ? "cross-env VITE_COVERAGE=true NODE_ENV=test npm run dev:vue -- --port=4000"
      : "npm run dev:vue -- --port=4000",
  },
  {
    name: "react",
    port: 4001,
    command: "npm run dev:react -- --port=4001",
  },
  {
    name: "angular",
    port: 4002,
    command: "npm run dev:angular -- --port=4002",
  },
] as const;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["line"],
    // ["html", { open: "never" }],
    // ["json", { outputFile: "test-results/results.json" }],
    // ["./tests/e2e/reporters/ordered-screenshots-reporter.ts", { outputDir: "test-results/ordered-screenshots" }],
  ],
  // preserveOutput: "always",
  // use: {
  //   trace: "on",
  //   screenshot: "on",
  // },
  projects: frameworkServers.map((framework) => ({
    name: `chromium-${framework.name}`,
    use: {
      ...devices["Desktop Chrome"],
      baseURL: `http://localhost:${framework.port}`,
    },
  })),
  webServer: frameworkServers.map((framework) => ({
    command: framework.command,
    url: `http://localhost:${framework.port}`,
    reuseExistingServer: !process.env.CI,
  })),
});
