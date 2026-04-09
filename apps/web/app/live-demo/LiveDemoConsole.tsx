"use client";

import type { CSSProperties, FormEvent } from "react";
import { useState } from "react";

interface DemoResponse {
  error?: string;
  analysis?: {
    brief: {
      title: string;
      attentionLevel: string;
      confidence: number;
      whatChanged: string[];
      reviewerFocus: string[];
      testImpact: string[];
    };
  };
  deliveries?: Array<{
    channel: string;
    status: string;
    message: string;
  }>;
}

export function LiveDemoConsole() {
  const [form, setForm] = useState({
    owner: "",
    repo: "",
    pullNumber: "",
    installationId: ""
  });
  const [result, setResult] = useState<DemoResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    const response = await fetch("/api/demo/analyze-pr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: form.owner,
        repo: form.repo,
        pullNumber: Number(form.pullNumber),
        ...(form.installationId ? { installationId: Number(form.installationId) } : {})
      })
    });
    setResult((await response.json()) as DemoResponse);
    setLoading(false);
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={heroStyle}>
        <div style={eyebrowStyle}>Live Pull Request Demo</div>
        <h2 style={{ margin: "10px 0", fontSize: 34 }}>Run the full agent workflow on a real PR</h2>
        <p style={{ margin: 0, maxWidth: 760, lineHeight: 1.6 }}>
          Enter a repository and pull request from a GitHub App installation you control. The system will fetch the
          real diff, analyze it with the configured provider, then publish to GitHub, Slack, and Discord if available.
        </p>
      </section>

      <div style={layoutStyle}>
        <form onSubmit={run} style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Target Pull Request</h3>
          <Field label="GitHub Owner" value={form.owner} onChange={(value) => setForm({ ...form, owner: value })} />
          <Field label="Repository Name" value={form.repo} onChange={(value) => setForm({ ...form, repo: value })} />
          <Field label="Pull Request Number" value={form.pullNumber} onChange={(value) => setForm({ ...form, pullNumber: value })} />
          <Field label="Installation ID (Optional if PAT set)" value={form.installationId} onChange={(value) => setForm({ ...form, installationId: value })} />
          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? "Running..." : "Analyze Real PR"}
          </button>
        </form>

        <section style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Result</h3>
          {!result ? (
            <p style={{ margin: 0, color: "#5f5449" }}>No run yet. Configure credentials on the Integrations page first.</p>
          ) : result.error ? (
            <p style={{ margin: 0, color: "#7b3525" }}>{result.error}</p>
          ) : result.analysis ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <strong>{result.analysis.brief.title}</strong>
                <div style={{ color: "#5f5449", marginTop: 4 }}>
                  Attention {result.analysis.brief.attentionLevel} · confidence {result.analysis.brief.confidence}
                </div>
              </div>
              <section>
                <strong>What changed</strong>
                <ul>
                  {result.analysis.brief.whatChanged.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section>
                <strong>Reviewer focus</strong>
                <ul>
                  {result.analysis.brief.reviewerFocus.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section>
                <strong>Delivery</strong>
                <ul>
                  {(result.deliveries ?? []).map((delivery) => (
                    <li key={`${delivery.channel}-${delivery.message}`}>
                      {delivery.channel}: {delivery.status} ({delivery.message})
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
        </section>
      </div>
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
    <label style={{ display: "grid", gap: 8, marginBottom: 16 }}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
    </label>
  );
}

const heroStyle: CSSProperties = {
  padding: 28,
  borderRadius: 24,
  background: "linear-gradient(135deg, #8a4f1f 0%, #f3dcc3 100%)",
  color: "#26150b"
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

const layoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 420px) 1fr",
  gap: 20
};

const panelStyle: CSSProperties = {
  borderRadius: 24,
  background: "rgba(255,255,255,0.74)",
  border: "1px solid rgba(29,27,22,0.08)",
  padding: 24
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
  background: "#8a4f1f",
  cursor: "pointer"
};
