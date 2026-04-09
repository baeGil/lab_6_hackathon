import { getStore } from "../../../../packages/db/src/store";

export default function RepositoriesPage() {
  const store = getStore();
  const analytics = store.getAnalytics();
  const repos = analytics.totalAnalyses === 0 ? [] : store.getRecentActivity(25).map((item) => item.snapshot.repoName);
  const uniqueRepos = [...new Set(repos)];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h2 style={{ marginBottom: 8 }}>Repositories</h2>
        <p style={{ margin: 0, color: "#5f5449" }}>
          This private beta scaffold keeps repository settings and memory in an in-process store while preserving the
          Prisma/Supabase domain model.
        </p>
      </div>
      <section
        style={{
          borderRadius: 20,
          background: "rgba(255,255,255,0.72)",
          padding: 24,
          border: "1px solid rgba(29,27,22,0.08)"
        }}
      >
        {uniqueRepos.length === 0 ? (
          <p style={{ margin: 0 }}>No repositories have been onboarded through webhook traffic yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
            {uniqueRepos.map((repo) => (
              <li key={repo}>{repo}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
