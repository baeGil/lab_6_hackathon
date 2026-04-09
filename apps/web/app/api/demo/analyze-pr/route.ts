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
import crypto from "node:crypto";

interface DemoRequest {
  owner: string;
  repo: string;
  pullNumber: number;
  installationId?: number;
}

async function fetchPullRequestWebhookShape(input: DemoRequest) {
  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const pat = process.env.GITHUB_PAT;
  console.log("Debug - GITHUB_PAT length:", pat?.length ?? "undefined");
  let token: string;

  if (pat) {
    token = pat;
  } else {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!appId || !privateKey) {
      throw new Error(`Missing GitHub configuration. Please set GITHUB_PAT or (GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY) in .env. Current GITHUB_PAT: ${pat ? "present" : "missing"}`);
    }
    if (!input.installationId) {
      throw new Error("Missing installationId for GitHub App authentication.");
    }

    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" }))
      .toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })).toString("base64url");
    const sign = await import("node:crypto");
    const signer = sign.createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    const jwt = `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;

    const tokenResponse = await fetch(`${apiUrl}/app/installations/${input.installationId}/access_tokens`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!tokenResponse.ok) {
      throw new Error(`Failed to create installation token: ${tokenResponse.status}`);
    }
    const { token: fetchedToken } = (await tokenResponse.json()) as { token: string };
    token = fetchedToken;
  }

  const url = `${apiUrl}/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}`;
  console.log("Debug - Fetching PR from URL:", url);
  const prResponse = await fetch(url, {
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
    installation: input.installationId ? { id: input.installationId } : undefined,
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
    const body = (await request.json()) as DemoRequest;
    const fakeWebhookPayload = await fetchPullRequestWebhookShape(body);
    const event = await buildWebhookEventFromGitHubPayload(fakeWebhookPayload, "opened", crypto.randomUUID());
    const result = await handleWebhookEvent(event, {
      store,
      provider: createProvider(),
      github: createGitHubAdapter(),
      slack: createSlackAdapter(undefined, store),
      discord: createDiscordAdapter(undefined, store)
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Demo Logic Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown live demo error." },
      { status: 500 }
    );
  }
}
