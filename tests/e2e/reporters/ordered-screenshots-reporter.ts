import path from "path";
import { copyFile, mkdir, rm, writeFile } from "fs/promises";
import type { FullConfig, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

type OrderedScreenshotsReporterOptions = {
  outputDir?: string;
};

function sanitizeSegment(value: unknown): string {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "unnamed";
}

function pad3(index: number): string {
  return String(index).padStart(3, "0");
}

export default class OrderedScreenshotsReporter implements Reporter {
  private readonly outputDir: string;

  private readonly workspaceRoot: string;

  constructor(options: OrderedScreenshotsReporterOptions = {}) {
    this.outputDir = options.outputDir || "test-results/ordered-screenshots";
    const maybeProcess = globalThis as { process?: { cwd?: () => string } };
    this.workspaceRoot = maybeProcess.process?.cwd?.() || ".";
  }

  async onBegin(_config: FullConfig): Promise<void> {
    const absoluteOutputDir = path.resolve(this.workspaceRoot, this.outputDir);
    const legacyOutputDir = path.resolve(this.workspaceRoot, "tests/e2e", this.outputDir);

    await rm(absoluteOutputDir, { recursive: true, force: true });
    await rm(legacyOutputDir, { recursive: true, force: true });
    await mkdir(absoluteOutputDir, { recursive: true });
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const fileAttachments = result.attachments.filter(
      (attachment): attachment is TestResult["attachments"][number] & { path: string } =>
        Boolean(attachment.path),
    );

    if (fileAttachments.length === 0) {
      return;
    }

    const projectName = test.parent?.project?.()?.name || "default-project";
    const projectFolder = sanitizeSegment(projectName);
    const relativeSpecPath = path.relative(this.workspaceRoot, test.location.file);
    const specPathParts = relativeSpecPath.split(path.sep).map((segment, index, parts): string => {
      if (index === parts.length - 1) {
        return sanitizeSegment(path.basename(segment, path.extname(segment)));
      }

      return sanitizeSegment(segment);
    });

    const titlePath = test.titlePath();
    const specFileName = path.basename(test.location.file);
    let logicalTitlePath = titlePath.filter((segment) => Boolean(segment && segment.trim()));

    while (logicalTitlePath.length > 0) {
      const head = logicalTitlePath[0];

      if (
        head === projectName ||
        head === test.location.file ||
        head === relativeSpecPath ||
        head === specFileName
      ) {
        logicalTitlePath = logicalTitlePath.slice(1);
        continue;
      }

      break;
    }

    if (logicalTitlePath.length === 0) {
      logicalTitlePath = [test.title];
    }
    const describeFolders = logicalTitlePath
      .slice(0, -1)
      .map((segment) => sanitizeSegment(segment))
      .filter(Boolean);
    const testFolder = sanitizeSegment(logicalTitlePath.at(-1) || test.title);
    const retryFolder = `retry-${result.retry}`;

    const destinationDir = path.resolve(
      this.workspaceRoot,
      this.outputDir,
      projectFolder,
      ...specPathParts,
      ...describeFolders,
      testFolder,
      retryFolder,
    );

    await mkdir(destinationDir, { recursive: true });

    const attachmentIndex: Array<{
      order: number;
      source: string;
      file: string;
      name: string;
      contentType: string | undefined;
    }> = [];

    for (let index = 0; index < fileAttachments.length; index += 1) {
      const attachment = fileAttachments[index];
      const sequence = pad3(index + 1);
      const extension = path.extname(attachment.path).toLowerCase() || ".png";
      const attachmentName = sanitizeSegment(attachment.name || "artifact");
      const outputFileName = `${sequence}-${attachmentName}${extension}`;
      const destinationPath = path.join(destinationDir, outputFileName);

      await copyFile(attachment.path, destinationPath);

      attachmentIndex.push({
        order: index + 1,
        source: attachment.path,
        file: outputFileName,
        name: attachment.name,
        contentType: attachment.contentType,
      });
    }

    await writeFile(
      path.join(destinationDir, "index.json"),
      JSON.stringify(
        {
          project: projectName,
          spec: relativeSpecPath,
          testTitlePath: test.titlePath(),
          status: result.status,
          retry: result.retry,
          artifacts: attachmentIndex,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}
