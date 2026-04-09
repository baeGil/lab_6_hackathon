"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useState, useTransition } from "react";

type Status = {
  githubAppConfigured: boolean;
  githubOAuthConfigured: boolean;
  githubWebhookSecretConfigured: boolean;
  slackConfigured: boolean;
  discordConfigured: boolean;
  groqConfigured: boolean;
  githubApiUrl: string;
  groqModelId: string;
  aiProviderMode: "heuristic" | "groq";
};

const initialForm = {
  slackWebhookUrl: "",
  discordWebhookUrl: ""
};

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
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const response = await fetch("/api/settings/integrations");
      const data = (await response.json()) as { status: Status };
      setStatus(data.status);
    });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => String(value).trim() !== "")
    );

    const response = await fetch("/api/settings/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as { ok: boolean; status: Status };
    setStatus(data.status);
    setMessage(data.ok ? "Credentials saved to the local secure runtime store." : "Save failed.");
    setForm((current) => ({
      ...current,
      slackWebhookUrl: "",
      discordWebhookUrl: ""
    }));
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={heroStyle}>
        <div style={heroEyebrowStyle}>Workspace Setup</div>
        <h2 style={{ margin: "10px 0", fontSize: 34 }}>Connect the live services your users need</h2>
        <p style={{ margin: 0, maxWidth: 760, lineHeight: 1.6 }}>
          This console writes credentials into the running app so you can test real GitHub pull requests, real Groq
          inference, and real Slack or Discord delivery without editing files on every run.
        </p>
      </section>

      <section style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Runtime Status</h3>
        <div style={statusGridStyle}>
          <StatusPill ok={Boolean(status?.groqConfigured)} label="Groq" />
          <StatusPill ok={Boolean(status?.slackConfigured)} label="Slack" />
          <StatusPill ok={Boolean(status?.discordConfigured)} label="Discord" />
        </div>
      </section>

      <form onSubmit={save} style={formGridStyle}>
        <section style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>System Managed Credentials</h3>
          <p style={{ marginTop: 0, color: "#5f5449", lineHeight: 1.6 }}>
            The Groq provider is a system-level credential. It must live in
            <code> .env </code> and is not editable by workspace users here.
          </p>
          <div style={{ display: "grid", gap: 10, color: "#3f382f" }}>
            <div>Groq provider: {status?.groqConfigured ? "configured" : "missing in .env"}</div>
            <div>GitHub API URL: {status?.githubApiUrl ?? "https://api.github.com"}</div>
            <div>AI mode: {status?.aiProviderMode ?? "heuristic"}</div>
            <div>Groq model: {status?.groqModelId ?? "llama-3.3-70b-versatile"}</div>
          </div>
        </section>

        <section style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Workspace Delivery Credentials</h3>
          <p style={{ marginTop: 0, color: "#5f5449", lineHeight: 1.6 }}>
            These are workspace-level user credentials. They belong in the UI, not in <code>.env</code>.
          </p>
          <Field label="Slack Incoming Webhook URL" value={form.slackWebhookUrl} onChange={(value) => setForm({ ...form, slackWebhookUrl: value })} />
          <Field
            label="Discord Webhook URL"
            value={form.discordWebhookUrl}
            onChange={(value) => setForm({ ...form, discordWebhookUrl: value })}
          />
        </section>

        <section style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Actions</h3>
          <p style={{ marginTop: 0, color: "#5f5449", lineHeight: 1.6 }}>
            Workspace secrets are encrypted in the local app runtime with <code>APP_MASTER_KEY</code>. In this repo they
            are not yet persisted to Postgres, so restarting the app clears them.
          </p>
          <button type="submit" disabled={isPending} style={buttonStyle}>
            {isPending ? "Saving..." : "Save Workspace Credentials"}
          </button>
          {message ? <p style={{ marginBottom: 0 }}>{message}</p> : null}
        </section>
      </form>
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
  padding: 24
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 18
};

const statusGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginBottom: 16
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
