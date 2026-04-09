import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { getStore } from "../../../packages/db/src/store";
import { getSessionCookieName, verifySession } from "../../../packages/shared/src/auth";

function Card({
  title,
  value,
  detail
}: {
  title: string;
  value: string | number;
  detail: string;
}) {
  return (
    <section style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardValue}>{value}</div>
      <div style={styles.cardDetail}>{detail}</div>
    </section>
  );
}

export default async function HomePage() {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(getSessionCookieName())?.value);
  const store = getStore();
  const analytics = session ? store.getAnalyticsForUser(session.userId) : store.getAnalytics();
  const activity = session ? store.getRecentActivityForUser(session.userId, 5) : [];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={styles.hero}>
        <div>
          <div style={styles.pill}>AI-Agent-First PR Review</div>
          <h2 style={styles.heroTitle}>Realtime PR intelligence for private beta repos</h2>
          <p style={styles.heroCopy}>
            Team leads sign in, install the GitHub App on their repositories, map each repository to Slack or Discord,
            and let the agent pipeline handle every pull request in realtime.
          </p>
        </div>
      </section>

      <section style={styles.grid}>
        <Card title="Webhook Events" value={analytics.totalEvents} detail="Unique GitHub deliveries processed." />
        <Card title="Analysis Runs" value={analytics.totalAnalyses} detail="Canonical PR briefs generated." />
        <Card title="Average Confidence" value={analytics.avgConfidence} detail="Mean confidence after escalation." />
        <Card title="Average Files / PR" value={analytics.avgFilesPerPr} detail="Useful for free-tier budgeting." />
      </section>

      <section style={styles.panel}>
        <h3 style={styles.sectionTitle}>Recent Activity</h3>
        {activity.length === 0 ? (
          <p style={styles.empty}>
            {session
              ? "No tracked repository activity yet. Sync repositories, add per-repo integrations, then open a pull request."
              : "Sign in with GitHub to see the repositories and activity scoped to your account."}
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {activity.map((item) => (
              <article key={`${item.snapshot.repoId}-${item.snapshot.prNumber}-${item.snapshot.updatedAt}`} style={styles.row}>
                <div>
                  <strong>{item.snapshot.title}</strong>
                  <div style={styles.meta}>
                    {item.snapshot.repoName} · PR #{item.snapshot.prNumber} · {item.brief.attentionLevel}
                  </div>
                </div>
                <div style={styles.meta}>confidence {item.brief.confidence}</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  hero: {
    padding: 28,
    borderRadius: 24,
    background: "linear-gradient(135deg, #d58631 0%, #f0d7b6 100%)",
    color: "#24150a"
  },
  pill: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.55)",
    fontSize: 12,
    letterSpacing: "0.1em",
    textTransform: "uppercase"
  },
  heroTitle: {
    margin: "14px 0 12px",
    fontSize: 38,
    maxWidth: 780
  },
  heroCopy: {
    margin: 0,
    fontSize: 18,
    lineHeight: 1.6,
    maxWidth: 760
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16
  },
  card: {
    padding: 20,
    borderRadius: 20,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(29,27,22,0.08)"
  },
  cardTitle: { fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6f6255" },
  cardValue: { marginTop: 8, fontSize: 34, fontWeight: 700 },
  cardDetail: { marginTop: 6, color: "#4a4138" },
  panel: {
    padding: 24,
    borderRadius: 24,
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(29,27,22,0.08)"
  },
  sectionTitle: {
    marginTop: 0,
    fontSize: 24
  },
  empty: {
    margin: 0,
    color: "#4a4138"
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    padding: "14px 0",
    borderBottom: "1px solid rgba(29,27,22,0.06)"
  },
  meta: {
    color: "#5f5449",
    marginTop: 6
  }
};
