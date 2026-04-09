import { describe, expect, it } from "vitest";
import { HeuristicAiProvider } from "../../ai-core/src/heuristic-provider";
import { runAnalysisGraph } from "./graph";

describe("analysis graph", () => {
  it("returns a canonical brief and payloads", async () => {
    const result = await runAnalysisGraph({
      provider: new HeuristicAiProvider(),
      config: {
        repoId: "repo-1",
        repoName: "demo/repo",
        notifySlack: true,
        notifyDiscord: true,
        quietHours: null,
        maxFilesPerAnalysis: 20,
        maxChunksPerAnalysis: 10,
        maxRunsPerHour: 20
      },
      memory: {
        repoId: "repo-1",
        sensitivePaths: ["auth"],
        noisyPaths: ["package-lock.json"],
        preferredSummaryStyle: "balanced",
        highRiskModules: ["auth"]
      },
      snapshot: {
        repoId: "repo-1",
        repoName: "demo/repo",
        prNumber: 42,
        title: "Tighten auth token validation",
        author: "alice",
        url: "https://github.com/demo/repo/pull/42",
        baseBranch: "main",
        headBranch: "feature/auth",
        eventType: "opened",
        labels: ["security"],
        reviewers: ["bob"],
        files: [
          {
            path: "src/auth/session.ts",
            patch: '+if (!token) throw new Error("missing token");',
            additions: 3,
            deletions: 1
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });

    expect(result.brief.whatChanged.length).toBeGreaterThan(0);
    expect(result.githubPayload.heading).toContain("PR #42");
    expect(["medium", "high"]).toContain(result.brief.attentionLevel);
  });
});
