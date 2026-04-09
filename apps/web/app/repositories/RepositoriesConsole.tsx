"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useTransition } from "react";
import type { IntegrationCredentialsStatus, TrackedRepository } from "../../../../packages/shared/src/index";

interface RepositoriesResponse {
  repositories: TrackedRepository[];
  status: IntegrationCredentialsStatus;
}

export function RepositoriesConsole() {
  const [repositories, setRepositories] = useState<TrackedRepository[]>([]);
  const [status, setStatus] = useState<IntegrationCredentialsStatus | null>(null);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  async function load() {
    const response = await fetch("/api/repositories");
    if (!response.ok) {
      setMessage(response.status === 401 ? "Sign in with GitHub to load repositories." : "Failed to load repositories.");
      return;
    }
    const data = (await response.json()) as RepositoriesResponse;
    setRepositories(data.repositories);
    setStatus(data.status);
  }

  useEffect(() => {
    startTransition(async () => {
      await load();
    });
  }, []);

  async function syncRepositories() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/repositories/sync", { method: "POST" });
      const data = (await response.json()) as { repositories?: TrackedRepository[]; error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "Repository sync failed.");
        return;
      }
      setRepositories(data.repositories ?? []);
      setMessage("GitHub repositories synced from your installations. Choose which ones should be monitored in realtime.");
      await load();
    });
  }

  async function toggleTracking(repoId: string, enabled: boolean) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/repositories/${repoId}/tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "Failed to update monitoring for this repository.");
        return;
      }
      setMessage(enabled ? "Repository monitoring enabled." : "Repository monitoring disabled.");
      await load();
    });
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={heroStyle}>
        <div style={eyebrowStyle}>Repo Onboarding</div>
        <h2 style={{ margin: "10px 0", fontSize: 34 }}>Install the GitHub App, sync your accessible repos, then decide which ones should notify the team</h2>
        <p style={{ margin: 0, maxWidth: 760, lineHeight: 1.6 }}>
          Team leads sign in once, install the GitHub App on the repositories they own, sync from GitHub, then enable
          monitoring only on the repos they want the agent pipeline to watch.
        </p>
      </section>

      <section style={panelStyle}>
        <div style={toolbarStyle}>
          <div>
            <h3 style={{ margin: 0 }}>Tracked Repositories</h3>
            <p style={{ margin: "6px 0 0", color: "#5f5449" }}>
              Sync after installing the GitHub App on more repositories or after gaining admin access to another installation.
            </p>
          </div>
          <div style={toolbarActionsStyle}>
            {status?.githubAppInstallUrl ? (
              <a href={status.githubAppInstallUrl} target="_blank" rel="noreferrer" style={secondaryButtonStyle}>
                Install GitHub App
              </a>
            ) : null}
            <button type="button" onClick={syncRepositories} disabled={isPending} style={buttonStyle}>
              {isPending ? "Syncing..." : "Sync From GitHub"}
            </button>
          </div>
        </div>

        {message ? <p style={{ marginBottom: 0, color: "#5f5449" }}>{message}</p> : null}

        {repositories.length === 0 ? (
          <div style={emptyStyle}>
            No repositories synced yet. Install the GitHub App on one of your repositories, then come back here and run sync.
          </div>
        ) : (
          <div style={repoGridStyle}>
            {repositories.map((repository) => (
              <article key={`${repository.ownerUserId}-${repository.repoId}`} style={repoCardStyle}>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={repoNameStyle}>{repository.repoName}</div>
                  <div style={metaStyle}>owner @{repository.ownerLogin}</div>
                </div>
                <div style={badgeRowStyle}>
                  <StatusBadge ok={repository.enabled} label="monitoring" />
                  <StatusBadge ok={Boolean(repository.installationId)} label="app installed" />
                  <StatusBadge ok={repository.webhookConfigured} label="realtime ready" />
                  <StatusBadge ok={repository.slackConfigured} label="slack" />
                  <StatusBadge ok={repository.discordConfigured} label="discord" />
                </div>
                <div style={toolbarActionsStyle}>
                  <button
                    type="button"
                    onClick={() => toggleTracking(repository.repoId, !repository.enabled)}
                    style={secondaryButtonStyle}
                  >
                    {repository.enabled ? "Stop Monitoring" : "Enable Monitoring"}
                  </button>
                  <a href={`/integrations?repoId=${repository.repoId}`} style={secondaryButtonStyle}>
                    {repository.slackConfigured || repository.discordConfigured ? "Manage Channels" : "Add Channels"}
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        background: ok ? "rgba(45,126,73,0.12)" : "rgba(138,58,38,0.12)",
        color: ok ? "#215933" : "#7b3525"
      }}
    >
      {label}
    </span>
  );
}

const heroStyle: CSSProperties = {
  padding: 28,
  borderRadius: 24,
  background: "linear-gradient(135deg, #0f5a46 0%, #e0f0df 100%)",
  color: "#102018"
};

const eyebrowStyle: CSSProperties = {
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

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap"
};

const toolbarActionsStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap"
};

const buttonStyle: CSSProperties = {
  border: 0,
  borderRadius: 14,
  padding: "12px 18px",
  font: "inherit",
  fontWeight: 700,
  color: "white",
  background: "#0f5a46",
  cursor: "pointer",
  textDecoration: "none"
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

const repoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16
};

const repoCardStyle: CSSProperties = {
  borderRadius: 20,
  padding: 20,
  display: "grid",
  gap: 14,
  background: "rgba(247,243,235,0.95)",
  border: "1px solid rgba(29,27,22,0.08)"
};

const repoNameStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700
};

const metaStyle: CSSProperties = {
  color: "#5f5449"
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap"
};

const emptyStyle: CSSProperties = {
  padding: 20,
  borderRadius: 18,
  background: "rgba(255,255,255,0.86)",
  color: "#5f5449"
};
