import { HeuristicAiProvider } from "../../ai-core/src/heuristic-provider";
import type { AiProvider } from "../../ai-core/src/provider";
import { runAnalysisGraph } from "../../ai-graph/src/graph";
import { getStore, type MemoryStore } from "../../db/src/store";
import type { WebhookEvent } from "../../shared/src/index";
import type { DiscordAdapter } from "../../integrations/src/discord";
import type { GitHubAdapter } from "../../integrations/src/github";
import type { SlackAdapter } from "../../integrations/src/slack";
import { log } from "../../observability/src/logger";

export interface WorkflowDependencies {
  store?: MemoryStore;
  provider?: AiProvider;
  github: GitHubAdapter;
  slack: SlackAdapter;
  discord: DiscordAdapter;
}

async function retryOnce<T extends { status: "sent" | "skipped" | "failed" }>(
  action: () => Promise<T>,
  label: string
) {
  const first = await action();
  if (first.status !== "failed") {
    return first;
  }
  log("warn", `${label} delivery failed, retrying once.`, { first });
  return action();
}

export async function handleWebhookEvent(event: WebhookEvent, deps: WorkflowDependencies) {
  const store = deps.store ?? getStore();
  const inserted = store.saveWebhookEvent(event);
  if (!inserted) {
    log("warn", "Duplicate webhook event skipped.", { deliveryId: event.deliveryId });
    return { deduped: true };
  }

  const snapshot = event.snapshot;
  const deliveryTargets = store.getDeliveryTargetsForRepo(snapshot.repoId);
  const baseConfig = store.getConfig(snapshot.repoId, snapshot.repoName);
  const config = {
    ...baseConfig,
    notifySlack: deliveryTargets.slackWebhookUrls.length > 0,
    notifyDiscord: deliveryTargets.discordWebhookUrls.length > 0
  };
  const memory = store.getMemory(snapshot.repoId, snapshot.repoName);
  const provider = deps.provider ?? new HeuristicAiProvider();

  const analysis = await runAnalysisGraph({
    snapshot,
    config,
    memory,
    provider
  });

  store.saveAnalysis(analysis);

  const deliveries = [
    await deps.github.upsertCanonicalComment(analysis),
    await deps.github.upsertCheckRun(analysis),
    await retryOnce(() => deps.slack.send(analysis), "Slack"),
    await retryOnce(() => deps.discord.send(analysis), "Discord")
  ];
  store.saveDeliveries(deliveries);

  if (analysis.brief.attentionLevel === "high") {
    const hotPath = analysis.brief.importantFiles[0];
    if (hotPath) {
      store.updateMemory(snapshot.repoId, {
        highRiskModules: Array.from(new Set([...memory.highRiskModules, hotPath.split("/")[0] ?? hotPath]))
      });
    }
  }

  log("info", "Webhook event processed.", {
    deliveryId: event.deliveryId,
    repo: snapshot.repoName,
    prNumber: snapshot.prNumber,
    attentionLevel: analysis.brief.attentionLevel
  });

  return {
    deduped: false,
    analysis,
    deliveries,
    analytics: store.getAnalytics()
  };
}
