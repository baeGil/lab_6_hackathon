import type { AnalysisResult, DeliveryRecord } from "../../shared/src/index";
import type { PullRequestFile, PullRequestSnapshot, WebhookEvent } from "../../shared/src/index";
import crypto from "node:crypto";

export interface GitHubRuntimeCredentials {
  githubAppId?: string;
  githubAppPrivateKey?: string;
  githubApiUrl?: string;
  githubPat?: string;
}

export interface GitHubAdapter {
  upsertCanonicalComment(result: AnalysisResult): Promise<DeliveryRecord>;
  upsertCheckRun(result: AnalysisResult): Promise<DeliveryRecord>;
}

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createAppJwt(appId: string, privateKey: string) {
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function githubRequest<T>(
  path: string,
  init: RequestInit,
  token: string,
  apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com"
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${path} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function getInstallationToken(installationId: number) {
  return getInstallationTokenWithCredentials(installationId, {});
}

async function getInstallationTokenWithCredentials(
  installationId: number | undefined,
  credentials: GitHubRuntimeCredentials
) {
  const pat = credentials.githubPat ?? process.env.GITHUB_PAT;
  if (pat) {
    return pat;
  }

  if (!installationId) {
    throw new Error("Missing installationId and GITHUB_PAT. One is required for GitHub authentication.");
  }

  const appId = credentials.githubAppId ?? process.env.GITHUB_APP_ID;
  const privateKey = credentials.githubAppPrivateKey ?? process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const apiUrl = credentials.githubApiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com";
  if (!appId || !privateKey) {
    throw new Error("Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY for live GitHub integration.");
  }
  const jwt = createAppJwt(appId, privateKey);
  const tokenResponse = await githubRequest<{ token: string }>(
    `/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`
      }
    },
    jwt,
    apiUrl
  );
  return tokenResponse.token;
}

function parseRepo(snapshot: PullRequestSnapshot) {
  const [owner, repo] = snapshot.repoName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repoName '${snapshot.repoName}', expected owner/repo.`);
  }
  return { owner, repo };
}

function renderCanonicalComment(result: AnalysisResult) {
  return [
    "<!-- pr-intelligence-canonical -->",
    `## ${result.brief.title}`,
    "",
    "### What changed",
    ...result.brief.whatChanged.map((item) => `- ${item}`),
    "",
    "### Why it matters",
    ...result.brief.whyItMatters.map((item) => `- ${item}`),
    "",
    "### Reviewer focus",
    ...result.brief.reviewerFocus.map((item) => `- ${item}`),
    "",
    `### Attention level`,
    result.brief.attentionLevel,
    "",
    "### Test impact",
    ...result.brief.testImpact.map((item) => `- ${item}`),
    "",
    `Confidence: ${result.brief.confidence}`,
    result.brief.disclaimer
  ].join("\n");
}

export class FakeGitHubAdapter implements GitHubAdapter {
  public comments: string[] = [];
  public checks: string[] = [];

  async upsertCanonicalComment(result: AnalysisResult): Promise<DeliveryRecord> {
    const message = `${result.brief.title}\n${result.brief.whatChanged.join("\n")}\n${result.brief.disclaimer}`;
    this.comments.push(message);
    return {
      channel: "github",
      status: "sent",
      target: result.snapshot.url,
      timestamp: new Date().toISOString(),
      message: "Canonical PR comment updated."
    };
  }

  async upsertCheckRun(result: AnalysisResult): Promise<DeliveryRecord> {
    this.checks.push(`${result.snapshot.repoName}#${result.snapshot.prNumber}:${result.brief.attentionLevel}`);
    return {
      channel: "github",
      status: "sent",
      target: `${result.snapshot.url}/checks`,
      timestamp: new Date().toISOString(),
      message: "Check run updated."
    };
  }
}

export class RealGitHubAdapter implements GitHubAdapter {
  constructor(private readonly credentials: GitHubRuntimeCredentials = {}) {}

  async upsertCanonicalComment(result: AnalysisResult): Promise<DeliveryRecord> {
    const installationId = result.snapshot.installationId;
    const hasPat = Boolean(this.credentials.githubPat ?? process.env.GITHUB_PAT);

    if (!installationId && !hasPat) {
      return {
        channel: "github",
        status: "failed",
        target: result.snapshot.url,
        timestamp: new Date().toISOString(),
        message: "Missing installationId and GITHUB_PAT for GitHub live comment delivery."
      };
    }
    const token = await getInstallationTokenWithCredentials(installationId, this.credentials);
    const { owner, repo } = parseRepo(result.snapshot);
    const comments = await githubRequest<Array<{ id: number; body: string }>>(
      `/repos/${owner}/${repo}/issues/${result.snapshot.prNumber}/comments?per_page=100`,
      { method: "GET" },
      token,
      this.credentials.githubApiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com"
    );
    const body = renderCanonicalComment(result);
    const existing = comments.find((comment) => comment.body.includes("<!-- pr-intelligence-canonical -->"));

    if (existing) {
      await githubRequest(
        `/repos/${owner}/${repo}/issues/comments/${existing.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ body }),
          headers: { "Content-Type": "application/json" }
        },
        token,
        this.credentials.githubApiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com"
      );
    } else {
      await githubRequest(
        `/repos/${owner}/${repo}/issues/${result.snapshot.prNumber}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
          headers: { "Content-Type": "application/json" }
        },
        token,
        this.credentials.githubApiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com"
      );
    }

    return {
      channel: "github",
      status: "sent",
      target: result.snapshot.url,
      timestamp: new Date().toISOString(),
      message: "Canonical PR comment synced to GitHub."
    };
  }

  async upsertCheckRun(result: AnalysisResult): Promise<DeliveryRecord> {
    const installationId = result.snapshot.installationId;
    const headSha = result.snapshot.headSha;
    const hasPat = Boolean(this.credentials.githubPat ?? process.env.GITHUB_PAT);

    if ((!installationId && !hasPat) || !headSha) {
      return {
        channel: "github",
        status: "failed",
        target: `${result.snapshot.url}/checks`,
        timestamp: new Date().toISOString(),
        message: "Missing installationId/PAT or headSha for GitHub live check run."
      };
    }
    const token = await getInstallationTokenWithCredentials(installationId, this.credentials);
    const { owner, repo } = parseRepo(result.snapshot);
    const name = "PR Intelligence Agent";
    const summary = [
      `Attention level: ${result.brief.attentionLevel}`,
      `Confidence: ${result.brief.confidence}`,
      ...result.brief.reviewerFocus.slice(0, 3)
    ].join("\n");

    const existingRuns = await githubRequest<{ check_runs: Array<{ id: number; name: string }> }>(
      `/repos/${owner}/${repo}/commits/${headSha}/check-runs`,
      { method: "GET" },
      token,
      this.credentials.githubApiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com"
    );
    const existing = existingRuns.check_runs.find((run) => run.name === name);
    const payload = {
      name,
      head_sha: headSha,
      status: "completed",
      conclusion: result.brief.attentionLevel === "high" ? "neutral" : "success",
      output: {
        title: result.brief.title,
        summary
      }
    };

    if (existing) {
      await githubRequest(
        `/repos/${owner}/${repo}/check-runs/${existing.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" }
        },
        token,
        this.credentials.githubApiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com"
      );
    } else {
      await githubRequest(
        `/repos/${owner}/${repo}/check-runs`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" }
        },
        token,
        this.credentials.githubApiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com"
      );
    }

    return {
      channel: "github",
      status: "sent",
      target: `${result.snapshot.url}/checks`,
      timestamp: new Date().toISOString(),
      message: "Check run synced to GitHub."
    };
  }
}

function mapActionToEventType(action: string, merged: boolean | undefined): PullRequestSnapshot["eventType"] {
  if (action === "opened") return "opened";
  if (action === "reopened") return "reopened";
  if (action === "ready_for_review") return "ready_for_review";
  if (action === "synchronize") return "synchronize";
  if (action === "review_requested") return "review_requested";
  if (action === "review_request_removed") return "review_request_removed";
  if (action === "converted_to_draft") return "converted_to_draft";
  if (action === "closed" && merged) return "merged";
  return "closed";
}

export function verifyGitHubSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function buildWebhookEventFromGitHubPayload(
  body: any,
  action: string,
  deliveryId: string,
  credentials: GitHubRuntimeCredentials = {}
): Promise<WebhookEvent> {
  const installationId = body.installation?.id;
  const pat = credentials.githubPat ?? process.env.GITHUB_PAT;
  if (!installationId && !pat) {
    throw new Error("GitHub webhook payload is missing installation.id and no GITHUB_PAT configured.");
  }
  const token = await getInstallationTokenWithCredentials(installationId, credentials);
  const apiUrl = credentials.githubApiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com";
  const owner = body.repository?.owner?.login ?? body.repository?.owner?.name;
  const repo = body.repository?.name;
  const prNumber = body.pull_request?.number;
  if (!owner || !repo || !prNumber) {
    throw new Error("GitHub webhook payload is missing repository owner/name or pull request number.");
  }

  const files = await githubRequest<Array<{ filename: string; patch?: string; additions: number; deletions: number }>>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
    { method: "GET" },
    token,
    apiUrl
  );

  const mappedFiles: PullRequestFile[] = files
    .filter((file) => Boolean(file.patch))
    .map((file) => ({
      path: file.filename,
      patch: file.patch ?? "",
      additions: file.additions,
      deletions: file.deletions
    }));

  return {
    deliveryId,
    receivedAt: new Date().toISOString(),
    snapshot: {
      repoId: String(body.repository.id),
      repoName: `${owner}/${repo}`,
      prNumber,
      title: body.pull_request.title,
      author: body.pull_request.user?.login ?? "unknown",
      url: body.pull_request.html_url,
      baseBranch: body.pull_request.base?.ref ?? "main",
      headBranch: body.pull_request.head?.ref ?? "unknown",
      eventType: mapActionToEventType(action, body.pull_request.merged),
      labels: (body.pull_request.labels ?? []).map((label: { name: string }) => label.name),
      reviewers: (body.pull_request.requested_reviewers ?? []).map((reviewer: { login: string }) => reviewer.login),
      body: body.pull_request.body ?? "",
      files: mappedFiles,
      headSha: body.pull_request.head?.sha,
      installationId,
      createdAt: body.pull_request.created_at,
      updatedAt: body.pull_request.updated_at
    }
  };
}
