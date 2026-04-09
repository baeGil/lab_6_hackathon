import type { AnalysisResult, DeliveryRecord } from "../../shared/src/index";

export interface DiscordAdapter {
  send(result: AnalysisResult): Promise<DeliveryRecord>;
}

export class FakeDiscordAdapter implements DiscordAdapter {
  public messages: string[] = [];

  async send(result: AnalysisResult): Promise<DeliveryRecord> {
    if (!result.discordPayload) {
      return {
        channel: "discord",
        status: "skipped",
        target: "disabled",
        timestamp: new Date().toISOString(),
        message: "Discord is disabled for this repository."
      };
    }
    this.messages.push(result.discordPayload.summary.join(" | "));
    return {
      channel: "discord",
      status: "sent",
      target: "mock-discord-channel",
      timestamp: new Date().toISOString(),
      message: "Discord summary delivered."
    };
  }
}

export class RealDiscordAdapter implements DiscordAdapter {
  constructor(private readonly webhookUrl: string) {}

  async send(result: AnalysisResult): Promise<DeliveryRecord> {
    if (!result.discordPayload) {
      return {
        channel: "discord",
        status: "skipped",
        target: "disabled",
        timestamp: new Date().toISOString(),
        message: "Discord is disabled for this repository."
      };
    }

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `${result.discordPayload.heading} · ${result.brief.attentionLevel}`,
        embeds: [
          {
            title: result.discordPayload.heading,
            description: result.discordPayload.summary.join("\n"),
            color: result.brief.attentionLevel === "high" ? 15158332 : result.brief.attentionLevel === "medium" ? 15844367 : 3066993,
            fields: [
              { name: "Attention", value: result.brief.attentionLevel, inline: true },
              { name: "Confidence", value: String(result.brief.confidence), inline: true }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      return {
        channel: "discord",
        status: "failed",
        target: this.webhookUrl,
        timestamp: new Date().toISOString(),
        message: `Discord webhook failed: ${response.status}`
      };
    }

    return {
      channel: "discord",
      status: "sent",
      target: this.webhookUrl,
      timestamp: new Date().toISOString(),
      message: "Discord summary delivered."
    };
  }
}
