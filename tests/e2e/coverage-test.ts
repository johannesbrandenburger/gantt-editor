import { test as base, expect } from "@playwright/test";
export type { Page, TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const isCoverageRun = !!process.env.PW_E2E_COVERAGE;

const sanitizePathPart = (value: string): string =>
  value
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);

type IstanbulCoverageMap = Record<string, unknown>;

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);

    if (!isCoverageRun) {
      return;
    }

    let coverage: IstanbulCoverageMap | null = null;

    try {
      coverage = await page.evaluate(() => {
        const rawCoverage = (window as Window & { __coverage__?: IstanbulCoverageMap }).__coverage__;
        return rawCoverage && Object.keys(rawCoverage).length > 0 ? rawCoverage : null;
      });
    } catch {
      return;
    }

    if (!coverage) {
      return;
    }

    const safeProjectName = sanitizePathPart(testInfo.project.name);
    const safeTestTitle = sanitizePathPart(testInfo.titlePath.join("__"));
    const fileName = `${safeProjectName}-${testInfo.workerIndex}-${safeTestTitle}-${testInfo.retry}.json`;
    const outputDir = path.join(process.cwd(), ".nyc_output");

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, fileName), JSON.stringify(coverage));
  },
});

export { expect };
