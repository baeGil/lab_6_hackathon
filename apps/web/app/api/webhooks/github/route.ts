import { NextResponse } from "next/server";
import { getStore } from "../../../../../../packages/db/src/store";
import { buildWebhookEventFromGitHubPayload, verifyGitHubSignature } from "../../../../../../packages/integrations/src/github";
import { handleWebhookEvent } from "../../../../../../packages/workflows/src/index";
import {
  createDiscordAdapter,
  createGitHubAdapter,
  createProvider,
  createSlackAdapter
} from "../../../../../../packages/workflows/src/runtime";

export async function POST(request: Request) {
  const store = getStore();
  const rawBody = await request.text();
  const payload = JSON.parse(rawBody);
  const isInternalPayload = Boolean(payload?.snapshot && payload?.deliveryId);
  const repoIdFromPayload = payload?.repository?.id ? String(payload.repository.id) : payload?.snapshot?.repoId;

  let event = payload;
  if (!isInternalPayload) {
    if (repoIdFromPayload && !store.isRepoTracked(repoIdFromPayload)) {
      return NextResponse.json(
        {
          skipped: true,
          reason: "Repository is not enabled by any signed-in user."
        },
        { status: 202 }
      );
    }

    const configuredSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (configuredSecret) {
      const signature = request.headers.get("x-hub-signature-256");
      if (!verifyGitHubSignature(rawBody, signature, configuredSecret)) {
        return NextResponse.json({ error: "Invalid GitHub webhook signature." }, { status: 401 });
      }
    }
    const action = payload?.action;
    const deliveryId = request.headers.get("x-github-delivery") ?? crypto.randomUUID();
    event = await buildWebhookEventFromGitHubPayload(payload, action, deliveryId);
  }

  const deliveryTargets = store.getDeliveryTargetsForRepo(event.snapshot.repoId);
  if (!isInternalPayload && !deliveryTargets.tracked) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Repository has not been onboarded by any signed-in user yet."
      },
      { status: 202 }
    );
  }

  const result = await handleWebhookEvent(event, {
    store,
    provider: createProvider(),
    github: createGitHubAdapter(),
    slack: createSlackAdapter(deliveryTargets.slackWebhookUrls),
    discord: createDiscordAdapter(deliveryTargets.discordWebhookUrls)
  });
  return NextResponse.json(result);
}
