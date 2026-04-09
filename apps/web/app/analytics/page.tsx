import { getStore } from "../../../../packages/db/src/store";

export default function AnalyticsPage() {
  const analytics = getStore().getAnalytics();
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h2 style={{ marginBottom: 8 }}>Analytics</h2>
        <p style={{ margin: 0, color: "#5f5449" }}>Operational metrics sized for a free-tier private beta.</p>
      </div>
      <section
        style={{
          display: "grid",
          gap: 12,
          borderRadius: 20,
          background: "rgba(255,255,255,0.72)",
          padding: 24,
          border: "1px solid rgba(29,27,22,0.08)"
        }}
      >
        <div>Total webhook events: {analytics.totalEvents}</div>
        <div>Total analyses: {analytics.totalAnalyses}</div>
        <div>Average confidence: {analytics.avgConfidence}</div>
        <div>Average files per PR: {analytics.avgFilesPerPr}</div>
        <div>
          Attention distribution: low {analytics.attentionDistribution.low} / medium {analytics.attentionDistribution.medium} / high{" "}
          {analytics.attentionDistribution.high}
        </div>
      </section>
    </div>
  );
}
