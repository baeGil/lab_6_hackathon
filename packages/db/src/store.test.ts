import { describe, expect, it } from "vitest";
import { MemoryStore } from "./store";

describe("memory store", () => {
  it("keeps tracked repositories scoped to the signed-in user", () => {
    const store = new MemoryStore();

    store.upsertUser({ userId: "github:1", githubId: "1", login: "alice" }, "token-a");
    store.upsertUser({ userId: "github:2", githubId: "2", login: "bob" }, "token-b");

    store.replaceTrackedRepositoriesForUser("github:1", [
      { repoId: "repo-1", repoName: "alice/alpha", installationId: 11, ownerLogin: "alice" }
    ]);
    store.replaceTrackedRepositoriesForUser("github:2", [
      { repoId: "repo-2", repoName: "bob/beta", installationId: 22, ownerLogin: "bob" }
    ]);

    expect(store.listTrackedRepositoriesForUser("github:1").map((repo) => repo.repoName)).toEqual(["alice/alpha"]);
    expect(store.listTrackedRepositoriesForUser("github:2").map((repo) => repo.repoName)).toEqual(["bob/beta"]);
  });

  it("resolves delivery targets per repository", () => {
    const store = new MemoryStore();

    store.upsertUser({ userId: "github:1", githubId: "1", login: "alice" }, "token-a");
    store.replaceTrackedRepositoriesForUser("github:1", [
      { repoId: "repo-1", repoName: "alice/alpha", installationId: 11, ownerLogin: "alice" }
    ]);
    store.setRepositoryTracking("github:1", "repo-1", true);
    store.saveRepoIntegration("github:1", "repo-1", {
      slackWebhookUrl: "https://hooks.slack.test/a",
      discordWebhookUrl: "https://discord.test/a"
    });

    expect(store.getDeliveryTargetsForRepo("repo-1")).toEqual({
      tracked: true,
      slackWebhookUrls: ["https://hooks.slack.test/a"],
      discordWebhookUrls: ["https://discord.test/a"]
    });
    expect(store.getDeliveryTargetsForRepo("repo-missing")).toEqual({
      tracked: false,
      slackWebhookUrls: [],
      discordWebhookUrls: []
    });
  });
});
