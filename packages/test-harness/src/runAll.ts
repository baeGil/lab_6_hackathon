import { MemoryStore } from "../../db/src/store";
import { FakeDiscordAdapter } from "../../integrations/src/discord";
import { FakeGitHubAdapter } from "../../integrations/src/github";
import { FakeSlackAdapter } from "../../integrations/src/slack";
import { handleWebhookEvent } from "../../workflows/src/index";
import { createDuplicateEvent, createLargePrEvent, createSmallPrEvent } from "./fixtures/events";

type ScenarioResult = {
  name: string;
  ok: boolean;
  detail: Record<string, unknown>;
};

async function runScenario(
  name: string,
  eventFactory: () => Parameters<typeof handleWebhookEvent>[0],
  options: { duplicate?: boolean; slackFailOnce?: boolean } = {}
): Promise<ScenarioResult> {
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
    slackWebhookUrl: "https://hooks.slack.test/team",
    discordWebhookUrl: "https://discord.test/team"
  });
  const github = new FakeGitHubAdapter();
  const slack = new FakeSlackAdapter(options.slackFailOnce);
  const discord = new FakeDiscordAdapter();

  const event = eventFactory();
  const first = await handleWebhookEvent(event, { store, github, slack, discord });
  let second: Awaited<ReturnType<typeof handleWebhookEvent>> | null = null;

  if (options.duplicate) {
    const duplicateEvent = createDuplicateEvent();
    duplicateEvent.deliveryId = event.deliveryId;
    duplicateEvent.snapshot.prNumber = event.snapshot.prNumber;
    duplicateEvent.snapshot.title = event.snapshot.title;
    duplicateEvent.snapshot.files = event.snapshot.files;
    second = await handleWebhookEvent(duplicateEvent, { store, github, slack, discord });
  }

  const analytics = store.getAnalytics();
  const ok =
    !first.deduped &&
    github.comments.length >= 1 &&
    github.checks.length >= 1 &&
    discord.messages.length >= 1 &&
    analytics.totalAnalyses >= 1;

  return {
    name,
    ok,
    detail: {
      first,
      second,
      analytics,
      githubComments: github.comments.length,
      githubChecks: github.checks.length,
      slackMessages: slack.messages.length,
      discordMessages: discord.messages.length,
      dedupedSecond: second?.deduped ?? null
    }
  };
}

async function main() {
  const scenarios = [
    await runScenario("small-pr", createSmallPrEvent),
    await runScenario("large-pr-partial", createLargePrEvent),
    await runScenario("slack-retry-surface", createSmallPrEvent, { slackFailOnce: true }),
    await runScenario("duplicate-webhook", createDuplicateEvent, { duplicate: true })
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    scenarios,
    passed: scenarios.filter((item) => item.ok).length,
    failed: scenarios.filter((item) => !item.ok).length
  };

  console.log(JSON.stringify(report, null, 2));
  if (report.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
