import { describe, expect, it } from "vitest";
import { MemoryStore } from "../../db/src/store";
import { FakeDiscordAdapter } from "../../integrations/src/discord";
import { FakeGitHubAdapter } from "../../integrations/src/github";
import { FakeSlackAdapter } from "../../integrations/src/slack";
import { handleWebhookEvent } from "./index";

const baseEvent = {
  deliveryId: "delivery-1",
  receivedAt: new Date().toISOString(),
  snapshot: {
    repoId: "repo-1",
    repoName: "demo/repo",
    prNumber: 7,
    title: "Protect auth secrets",
    author: "alice",
    url: "https://github.com/demo/repo/pull/7",
    baseBranch: "main",
    headBranch: "feature/protect-auth",
    eventType: "opened" as const,
    labels: ["security"],
    reviewers: ["bob"],
    files: [
      {
        path: "src/auth/token.ts",
        patch: '+const token = "sk-1234567890abcdefghijkl";',
        additions: 4,
        deletions: 1
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
};

describe("workflow", () => {
  it("processes a webhook end-to-end", async () => {
    const store = new MemoryStore();
    store.upsertUser({ userId: "github:1", githubId: "1", login: "alice" }, "token-1");
    store.replaceTrackedRepositoriesForUser("github:1", [
      {
        repoId: "repo-1",
        repoName: "demo/repo",
        installationId: 99,
        ownerLogin: "alice"
      }
    ]);
    store.saveRepoIntegration("github:1", "repo-1", {
      slackWebhookUrl: "https://hooks.slack.test/one",
      discordWebhookUrl: "https://discord.test/one"
    });
    const github = new FakeGitHubAdapter();
    const slack = new FakeSlackAdapter();
    const discord = new FakeDiscordAdapter();

    const result = await handleWebhookEvent(baseEvent, {
      store,
      github,
      slack,
      discord
    });

    expect(result.deduped).toBe(false);
    if ("analysis" in result && result.analysis) {
      expect(result.analysis.brief.attentionLevel).toBe("high");
      expect(result.analysis.reviewPlan.prType).toBe("security-sensitive");
      expect(result.analysis.critique.reviewerPosture).toBe("senior-review");
    }
    expect(github.comments).toHaveLength(1);
    expect(slack.messages).toHaveLength(1);
    expect(discord.messages).toHaveLength(1);
  });

  it("deduplicates webhook deliveries", async () => {
    const store = new MemoryStore();
    store.upsertUser({ userId: "github:1", githubId: "1", login: "alice" }, "token-1");
    store.replaceTrackedRepositoriesForUser("github:1", [
      {
        repoId: "repo-1",
        repoName: "demo/repo",
        installationId: 99,
        ownerLogin: "alice"
      }
    ]);
    store.saveRepoIntegration("github:1", "repo-1", {
      slackWebhookUrl: "https://hooks.slack.test/one",
      discordWebhookUrl: "https://discord.test/one"
    });
    const github = new FakeGitHubAdapter();
    const slack = new FakeSlackAdapter();
    const discord = new FakeDiscordAdapter();

    await handleWebhookEvent(baseEvent, { store, github, slack, discord });
    const second = await handleWebhookEvent(baseEvent, { store, github, slack, discord });

    expect(second.deduped).toBe(true);
    expect(github.comments).toHaveLength(1);
  });
});
