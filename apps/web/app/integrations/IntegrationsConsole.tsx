"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import type { IntegrationCredentialsStatus, RepoIntegration, TrackedRepository } from "../../../../packages/shared/src/index";

type RepositoriesResponse = {
  repositories: TrackedRepository[];
  status: IntegrationCredentialsStatus;
};

type DraftMap = Record<string, { slackWebhookUrl: string; discordWebhookUrl: string }>;

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        background: ok ? "rgba(45,126,73,0.12)" : "rgba(138,58,38,0.12)",
        color: ok ? "#215933" : "#7b3525",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase"
      }}
    >
      {label}
    </span>
  );
}

export function IntegrationsConsole() {
  const searchParams = useSearchParams();
  const highlightedRepoId = searchParams.get("repoId");
  const [repositories, setRepositories] = useState<TrackedRepository[]>([]);
  const [status, setStatus] = useState<IntegrationCredentialsStatus | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const authMessage = useMemo(() => {
    const auth = searchParams.get("auth");
    if (auth === "ok") return "GitHub account connected. Sync your repositories, then configure channels per repo.";
    if (auth === "failed") return "GitHub sign-in failed. Try again.";
    if (auth === "missing-client") return "GitHub OAuth client credentials are missing on the server.";
    if (auth === "token-error") return "GitHub refused the OAuth code exchange.";
    if (auth === "no-token") return "GitHub did not return an access token.";
    if (auth === "user-error") return "GitHub login succeeded, but the user profile lookup failed.";
    return "";
  }, [searchParams]);

  async function load() {
    const [statusResponse, reposResponse] = await Promise.all([
      fetch("/api/settings/integrations"),
      fetch("/api/repositories")
    ]);

    if (statusResponse.ok) {
      const statusData = (await statusResponse.json()) as { status: IntegrationCredentialsStatus };
      setStatus(statusData.status);
    }

    if (!reposResponse.ok) {
      if (reposResponse.status === 401) {
        setMessage("Sign in with GitHub to configure per-repository channels.");
      }
      return;
    }

    const reposData = (await reposResponse.json()) as RepositoriesResponse;
    setRepositories(reposData.repositories);
    setStatus(reposData.status);

    const nextDrafts: DraftMap = {};
    await Promise.all(
      reposData.repositories.map(async (repository) => {
        const response = await fetch(`/api/repositories/${repository.repoId}/integrations`);
        if (!response.ok) return;
        const data = (await response.json()) as { integration: RepoIntegration | null };
        nextDrafts[repository.repoId] = {
          slackWebhookUrl: data.integration?.slackWebhookUrl ?? "",
          discordWebhookUrl: data.integration?.discordWebhookUrl ?? ""
        };
      })
    );
    setDrafts(nextDrafts);
  }

  useEffect(() => {
    startTransition(async () => {
      await load();
    });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>, repoId: string) {
    event.preventDefault();
    setMessage("");
    const draft = drafts[repoId] ?? { slackWebhookUrl: "", discordWebhookUrl: "" };
    const response = await fetch(`/api/repositories/${repoId}/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "Failed to save repository integration.");
      return;
    }
    setMessage("Repository integrations saved.");
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={heroStyle}>
        <div style={heroEyebrowStyle}>Team Channels</div>
        <h2 style={{ margin: "10px 0", fontSize: 34 }}>Route each tracked repository to the Slack or Discord channel it deserves</h2>
        <p style={{ margin: 0, maxWidth: 760, lineHeight: 1.6 }}>
          Team leads configure channel webhooks once per repo. Developers keep coding; pull requests flow back into the
          matching team channel automatically.
        </p>
      </section>

      {(authMessage || message) && (
        <section style={noticeStyle}>
          <div>{authMessage || message}</div>
        </section>
      )}

      <section style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>System Managed Credentials</h3>
        <p style={{ marginTop: 0, color: "#5f5449", lineHeight: 1.6 }}>
          GitHub OAuth, the GitHub App, webhook verification, and Groq stay on the server. Team leads only need to
          sign in with GitHub, install the app on their repositories, then map each repository to the correct channel.
        </p>
        <div style={statusGridStyle}>
          <StatusPill ok={Boolean(status?.githubOAuthConfigured)} label="GitHub OAuth" />
          <StatusPill ok={Boolean(status?.githubUserTokenConfigured)} label="GitHub Login" />
          <StatusPill ok={Boolean(status?.githubAppConfigured)} label="GitHub App" />
          <StatusPill ok={Boolean(status?.githubWebhookSecretConfigured)} label="Webhook Secret" />
          <StatusPill ok={Boolean(status?.groqConfigured)} label="Groq" />
        </div>
        {status?.githubAppInstallUrl ? (
          <div style={ctaRowStyle}>
            <a href={status.githubAppInstallUrl} target="_blank" rel="noreferrer" style={buttonStyle}>
              Install GitHub App On A Repo
            </a>
            <a href="/repositories" style={secondaryButtonStyle}>
              Sync Repositories
            </a>
          </div>
        ) : null}
      </section>

      <section style={panelStyle}>
        <div style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Per-Repository Integrations</h3>
          <p style={{ margin: 0, color: "#5f5449", lineHeight: 1.6 }}>
            A repository can use Slack, Discord, or both. Reusing the same webhook URL across multiple repos is fully
            supported for v1.
          </p>
        </div>

        {repositories.length === 0 ? (
          <div style={emptyStyle}>
            No repositories are available yet. Install the GitHub App on a repository you own, then go to{" "}
            <a href="/repositories">Repositories</a> and sync first.
          </div>
        ) : (
          <div style={repoListStyle}>
            {repositories.map((repository) => {
              const draft = drafts[repository.repoId] ?? { slackWebhookUrl: "", discordWebhookUrl: "" };
              const highlighted = repository.repoId === highlightedRepoId;
              return (
                <form
                  key={`${repository.ownerUserId}-${repository.repoId}`}
                  onSubmit={(event) => save(event, repository.repoId)}
                  style={{
                    ...repoPanelStyle,
                    borderColor: highlighted ? "rgba(13,91,114,0.35)" : "rgba(29,27,22,0.08)",
                    boxShadow: highlighted ? "0 0 0 3px rgba(13,91,114,0.08)" : "none"
                  }}
                >
                  <div style={{ display: "grid", gap: 6 }}>
                  <div style={repoTitleStyle}>{repository.repoName}</div>
                    <div style={{ color: "#5f5449" }}>owner @{repository.ownerLogin}</div>
                  </div>
                  <div style={badgeRowStyle}>
                    <StatusPill ok={repository.enabled} label="Monitoring" />
                    <StatusPill ok={Boolean(repository.installationId)} label="App Installed" />
                    <StatusPill ok={repository.webhookConfigured} label="Realtime Ready" />
                    <StatusPill ok={repository.slackConfigured} label="Slack" />
                    <StatusPill ok={repository.discordConfigured} label="Discord" />
                  </div>
                  <Field
                    label="Slack Incoming Webhook URL"
                    value={draft.slackWebhookUrl}
                    onChange={(value) =>
                      setDrafts((current) => ({
                        ...current,
                        [repository.repoId]: { ...draft, slackWebhookUrl: value }
                      }))
                    }
                  />
                  <Field
                    label="Discord Webhook URL"
                    value={draft.discordWebhookUrl}
                    onChange={(value) =>
                      setDrafts((current) => ({
                        ...current,
                        [repository.repoId]: { ...draft, discordWebhookUrl: value }
                      }))
                    }
                  />
                  <button type="submit" disabled={isPending} style={buttonStyle}>
                    {isPending ? "Saving..." : "Save Repo Integration"}
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={labelStyle}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
    </label>
  );
}

const heroStyle: CSSProperties = {
  padding: 28,
  borderRadius: 24,
  background: "linear-gradient(135deg, #0d5b72 0%, #d8ebe6 100%)",
  color: "#0d1920"
};

const heroEyebrowStyle: CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.55)",
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase"
};

const panelStyle: CSSProperties = {
  borderRadius: 24,
  background: "rgba(255,255,255,0.74)",
  border: "1px solid rgba(29,27,22,0.08)",
  padding: 24,
  display: "grid",
  gap: 18
};

const noticeStyle: CSSProperties = {
  borderRadius: 18,
  padding: "14px 18px",
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(29,27,22,0.08)"
};

const statusGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12
};

const ctaRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap"
};

const secondaryButtonStyle: CSSProperties = {
  borderRadius: 14,
  padding: "12px 18px",
  font: "inherit",
  fontWeight: 700,
  color: "#1d1b16",
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(29,27,22,0.12)",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block"
};

const repoListStyle: CSSProperties = {
  display: "grid",
  gap: 18
};

const repoPanelStyle: CSSProperties = {
  borderRadius: 22,
  background: "rgba(247,243,235,0.95)",
  border: "1px solid rgba(29,27,22,0.08)",
  padding: 20,
  display: "grid",
  gap: 14
};

const repoTitleStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 8
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(29,27,22,0.15)",
  padding: "12px 14px",
  font: "inherit",
  background: "rgba(255,255,255,0.95)",
  boxSizing: "border-box"
};

const buttonStyle: CSSProperties = {
  border: 0,
  borderRadius: 14,
  padding: "12px 18px",
  font: "inherit",
  fontWeight: 700,
  color: "white",
  background: "#0d5b72",
  cursor: "pointer"
};

const emptyStyle: CSSProperties = {
  padding: 18,
  borderRadius: 18,
  background: "rgba(255,255,255,0.82)",
  color: "#5f5449"
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap"
};
