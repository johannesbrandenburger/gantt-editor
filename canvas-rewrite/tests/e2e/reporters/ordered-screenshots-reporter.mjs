import path from "node:path";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";

function sanitizeSegment(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "unnamed";
}

function pad3(index) {
  return String(index).padStart(3, "0");
}

export default class OrderedScreenshotsReporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || "test-results/ordered-screenshots";
    this.workspaceRoot = process.cwd();
  }

  async onBegin() {
    const absoluteOutputDir = path.resolve(this.workspaceRoot, this.outputDir);
    const legacyOutputDir = path.resolve(this.workspaceRoot, "tests/e2e", this.outputDir);

    await rm(absoluteOutputDir, { recursive: true, force: true });
    await rm(legacyOutputDir, { recursive: true, force: true });
    await mkdir(absoluteOutputDir, { recursive: true });
  }

  async onTestEnd(test, result) {
    const fileAttachments = result.attachments.filter((attachment) => Boolean(attachment.path));

    if (fileAttachments.length === 0) {
      return;
    }

    const projectName = test.parent?.project?.().name || "default-project";
    const projectFolder = sanitizeSegment(projectName);
    const relativeSpecPath = path.relative(this.workspaceRoot, test.location.file);
    const specPathParts = relativeSpecPath.split(path.sep).map((segment, index, parts) => {
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

    const attachmentIndex = [];

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
