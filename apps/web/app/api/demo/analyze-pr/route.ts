import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStore } from "../../../../../../packages/db/src/store";
import { buildWebhookEventFromGitHubPayload } from "../../../../../../packages/integrations/src/github";
import { handleWebhookEvent } from "../../../../../../packages/workflows/src/index";
import {
  createDiscordAdapter,
  createGitHubAdapter,
  createProvider,
  createSlackAdapter
} from "../../../../../../packages/workflows/src/runtime";
import { getSessionCookieName, verifySession } from "../../../../../../packages/shared/src/auth";

interface DemoRequest {
  owner: string;
  repo: string;
  pullNumber: number;
}

async function fetchPullRequestWebhookShape(input: DemoRequest, token: string, installationId?: number) {
  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const resolvedApiUrl = apiUrl;

  const prResponse = await fetch(`${resolvedApiUrl}/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!prResponse.ok) {
    throw new Error(`Failed to fetch PR: ${prResponse.status}`);
  }
  const pr = await prResponse.json();

  return {
    action: "opened",
    ...(installationId ? { installation: { id: installationId } } : {}),
    repository: {
      id: pr.base.repo.id,
      name: input.repo,
      owner: { login: input.owner }
    },
    pull_request: {
      ...pr,
      number: input.pullNumber
    }
  };
}

export async function POST(request: Request) {
  try {
    const store = getStore();
    const cookieStore = await cookies();
    const session = verifySession(cookieStore.get(getSessionCookieName())?.value);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const accessToken = store.getUserAccessToken(session.userId);
    if (!accessToken) {
      return NextResponse.json({ error: "Missing GitHub account token. Sign in with GitHub again." }, { status: 400 });
    }
    const body = (await request.json()) as DemoRequest;
    const trackedRepository = store
      .listTrackedRepositoriesForUser(session.userId)
      .find((repository) => repository.repoName.toLowerCase() === `${body.owner}/${body.repo}`.toLowerCase());
    const fakeWebhookPayload = await fetchPullRequestWebhookShape(body, accessToken, trackedRepository?.installationId);
    const event = await buildWebhookEventFromGitHubPayload(fakeWebhookPayload, "opened", crypto.randomUUID(), {
      githubToken: accessToken
    });
    const deliveryTargets = store.getDeliveryTargetsForRepo(event.snapshot.repoId);
    const result = await handleWebhookEvent(event, {
      store,
      provider: createProvider(),
      github: createGitHubAdapter(trackedRepository?.installationId ? undefined : accessToken),
      slack: createSlackAdapter(deliveryTargets.slackWebhookUrls),
      discord: createDiscordAdapter(deliveryTargets.discordWebhookUrls)
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown live demo error." },
      { status: 500 }
    );
  }
}
