import { describe, expect, it } from "vitest";
import { chunkFiles, filterRelevantFiles, maskSensitiveTokens } from "./utils";

describe("ai-core utils", () => {
  it("filters noisy files", () => {
    const files = [
      { path: "src/app.ts", patch: "+const x = 1", additions: 1, deletions: 0 },
      { path: "package-lock.json", patch: "+{}", additions: 1, deletions: 1 }
    ];
    const result = filterRelevantFiles(files, {
      repoId: "1",
      sensitivePaths: [],
      noisyPaths: ["package-lock.json"],
      preferredSummaryStyle: "balanced",
      highRiskModules: []
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("src/app.ts");
  });

  it("masks secrets and emits findings", () => {
    const files = [
      {
        path: "src/auth.ts",
        patch: '+const token = "sk-1234567890abcdefghijkl";',
        additions: 1,
        deletions: 0
      }
    ];
    const result = maskSensitiveTokens(files, {
      repoId: "1",
      sensitivePaths: ["auth"],
      noisyPaths: [],
      preferredSummaryStyle: "balanced",
      highRiskModules: []
    });
    expect(result.maskedFiles[0]?.patch).toContain("[MASKED]");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("chunks files based on config", () => {
    const chunks = chunkFiles(
      new Array(6).fill(null).map((_, index) => ({
        path: `src/file-${index}.ts`,
        patch: "+const x = 1",
        additions: 1,
        deletions: 0
      })),
      {
        repoId: "1",
        repoName: "demo",
        notifySlack: true,
        notifyDiscord: true,
        quietHours: null,
        maxFilesPerAnalysis: 20,
        maxChunksPerAnalysis: 3,
        maxRunsPerHour: 20
      }
    );
    expect(chunks.length).toBe(3);
  });
});
