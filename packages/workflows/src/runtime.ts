import type { MemoryStore } from "../../db/src/store";
import { GroqAiProvider } from "../../ai-core/src/groq-provider";
import { HeuristicAiProvider } from "../../ai-core/src/heuristic-provider";
import type { AiProvider } from "../../ai-core/src/provider";
import { FakeDiscordAdapter, RealDiscordAdapter, type DiscordAdapter } from "../../integrations/src/discord";
import { FakeGitHubAdapter, RealGitHubAdapter, type GitHubAdapter } from "../../integrations/src/github";
import { FakeSlackAdapter, RealSlackAdapter, type SlackAdapter } from "../../integrations/src/slack";

export function createProvider(): AiProvider {
  const mode = process.env.AI_PROVIDER_MODE;
  if (mode === "groq") {
    return new GroqAiProvider(process.env.GROQ_API_KEY, process.env.GROQ_MODEL_ID ?? "llama-3.3-70b-versatile");
  }
  return new HeuristicAiProvider();
}

export function createGitHubAdapter(): GitHubAdapter {
  const liveGitHub = process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY;
  return liveGitHub ? new RealGitHubAdapter() : new FakeGitHubAdapter();
}

export function createSlackAdapter(webhookUrl?: string, store?: MemoryStore): SlackAdapter {
  const credentials = store?.getCredentials();
  const resolvedWebhook = webhookUrl ?? credentials?.slackWebhookUrl;
  return resolvedWebhook ? new RealSlackAdapter(resolvedWebhook) : new FakeSlackAdapter();
}

export function createDiscordAdapter(webhookUrl?: string, store?: MemoryStore): DiscordAdapter {
  const credentials = store?.getCredentials();
  const resolvedWebhook = webhookUrl ?? credentials?.discordWebhookUrl;
  return resolvedWebhook ? new RealDiscordAdapter(resolvedWebhook) : new FakeDiscordAdapter();
}
