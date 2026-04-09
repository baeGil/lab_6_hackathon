import { ensureRootEnvLoaded } from "../../shared/src/env";
import { GroqAiProvider } from "../../ai-core/src/groq-provider";
import { HeuristicAiProvider } from "../../ai-core/src/heuristic-provider";
import type { AiProvider } from "../../ai-core/src/provider";
import { FakeDiscordAdapter, RealDiscordAdapter, type DiscordAdapter } from "../../integrations/src/discord";
import { FakeGitHubAdapter, RealGitHubAdapter, type GitHubAdapter } from "../../integrations/src/github";
import { FakeSlackAdapter, RealSlackAdapter, type SlackAdapter } from "../../integrations/src/slack";
import type { AnalysisResult, DeliveryRecord } from "../../shared/src/index";

ensureRootEnvLoaded();

export function createProvider(): AiProvider {
  const mode = process.env.AI_PROVIDER_MODE;
  if (mode === "groq") {
    return new GroqAiProvider(process.env.GROQ_API_KEY, process.env.GROQ_MODEL_ID ?? "llama-3.3-70b-versatile");
  }
  return new HeuristicAiProvider();
}

export function createGitHubAdapter(githubToken?: string): GitHubAdapter {
  if (githubToken) {
    return new RealGitHubAdapter({ githubToken });
  }
  const liveGitHub = process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY;
  return liveGitHub ? new RealGitHubAdapter() : new FakeGitHubAdapter();
}

class MultiSlackAdapter implements SlackAdapter {
  constructor(private readonly adapters: SlackAdapter[]) {}

  async send(result: AnalysisResult): Promise<DeliveryRecord> {
    if (this.adapters.length === 0) {
      return new FakeSlackAdapter().send(result);
    }

    const records = await Promise.all(this.adapters.map((adapter) => adapter.send(result)));
    const sent = records.filter((record) => record.status === "sent");
    const failed = records.filter((record) => record.status === "failed");

    return {
      channel: "slack",
      status: sent.length > 0 && failed.length === 0 ? "sent" : sent.length === 0 ? "failed" : "sent",
      target: sent.map((record) => record.target).join(", ") || failed.map((record) => record.target).join(", "),
      timestamp: new Date().toISOString(),
      message:
        failed.length === 0
          ? `Slack summary delivered to ${sent.length} channel(s).`
          : `Slack delivered to ${sent.length} channel(s), ${failed.length} failed.`
    };
  }
}

class MultiDiscordAdapter implements DiscordAdapter {
  constructor(private readonly adapters: DiscordAdapter[]) {}

  async send(result: AnalysisResult): Promise<DeliveryRecord> {
    if (this.adapters.length === 0) {
      return new FakeDiscordAdapter().send(result);
    }

    const records = await Promise.all(this.adapters.map((adapter) => adapter.send(result)));
    const sent = records.filter((record) => record.status === "sent");
    const failed = records.filter((record) => record.status === "failed");

    return {
      channel: "discord",
      status: sent.length > 0 && failed.length === 0 ? "sent" : sent.length === 0 ? "failed" : "sent",
      target: sent.map((record) => record.target).join(", ") || failed.map((record) => record.target).join(", "),
      timestamp: new Date().toISOString(),
      message:
        failed.length === 0
          ? `Discord summary delivered to ${sent.length} channel(s).`
          : `Discord delivered to ${sent.length} channel(s), ${failed.length} failed.`
    };
  }
}

export function createSlackAdapter(webhookUrls?: string[]): SlackAdapter {
  const urls = (webhookUrls ?? []).filter(Boolean);
  if (urls.length === 0) {
    return new FakeSlackAdapter();
  }
  if (urls.length === 1) {
    return new RealSlackAdapter(urls[0]!);
  }
  return new MultiSlackAdapter(urls.map((webhookUrl) => new RealSlackAdapter(webhookUrl)));
}

export function createDiscordAdapter(webhookUrls?: string[]): DiscordAdapter {
  const urls = (webhookUrls ?? []).filter(Boolean);
  if (urls.length === 0) {
    return new FakeDiscordAdapter();
  }
  if (urls.length === 1) {
    return new RealDiscordAdapter(urls[0]!);
  }
  return new MultiDiscordAdapter(urls.map((webhookUrl) => new RealDiscordAdapter(webhookUrl)));
}
