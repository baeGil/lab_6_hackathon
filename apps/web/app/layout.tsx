import { cookies } from "next/headers";
import type { CSSProperties, ReactNode } from "react";
import { getSessionCookieName, verifySession } from "../../../packages/shared/src/auth";

export const metadata = {
  title: "PR Intelligence Agent Platform",
  description: "AI-agent-first PR monitoring, summarization and notification platform."
};

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/repositories", label: "Repositories" },
  { href: "/integrations", label: "Integrations" },
  { href: "/analytics", label: "Analytics" },
  { href: "/live-demo", label: "Live Demo" }
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(getSessionCookieName())?.value);

  return (
    <html lang="en">
      <body style={styles.body}>
        <div style={styles.shell}>
          <aside style={styles.sidebar}>
            <div>
              <div style={styles.eyebrow}>Private Beta</div>
              <h1 style={styles.brand}>PR Intelligence</h1>
              <p style={styles.copy}>GitHub App + LangGraphJS + realtime delivery for review triage.</p>
            </div>
            <div style={styles.sessionBox}>
              {session ? (
                <>
                  <div style={styles.sessionLabel}>Signed in with GitHub</div>
                  <div style={styles.sessionName}>{session.name ?? session.login}</div>
                  <div style={styles.sessionSubtle}>@{session.login}</div>
                  <a href="/api/auth/logout" style={{ ...styles.navItem, marginTop: 12, display: "inline-block" }}>
                    Log Out
                  </a>
                </>
              ) : (
                <>
                  <div style={styles.sessionLabel}>Authentication</div>
                  <div style={styles.sessionSubtle}>Connect GitHub before configuring live integrations.</div>
                  <a href="/api/auth/github/login" style={{ ...styles.navItem, display: "inline-block", marginTop: 12 }}>
                    Sign In With GitHub
                  </a>
                </>
              )}
            </div>
            <nav style={styles.nav}>
              {navItems.map((item) => (
                <a key={item.href} href={item.href} style={styles.navItem}>
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
          <main style={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}

const styles: Record<string, CSSProperties> = {
  body: {
    margin: 0,
    fontFamily: "Georgia, Times, serif",
    background:
      "radial-gradient(circle at top left, rgba(248,228,196,0.7), transparent 30%), linear-gradient(180deg, #f6f1e8 0%, #efe6d8 100%)",
    color: "#1d1b16"
  },
  shell: {
    display: "grid",
    minHeight: "100vh",
    gridTemplateColumns: "280px 1fr"
  },
  sidebar: {
    borderRight: "1px solid rgba(29,27,22,0.08)",
    padding: "32px 24px",
    background: "rgba(255,255,255,0.45)",
    backdropFilter: "blur(10px)"
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#7b5b2d"
  },
  brand: {
    margin: "8px 0 12px",
    fontSize: 30
  },
  copy: {
    margin: 0,
    color: "#4a4138",
    lineHeight: 1.5
  },
  sessionBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    background: "rgba(255,255,255,0.72)"
  },
  sessionLabel: {
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#7b5b2d"
  },
  sessionName: {
    marginTop: 6,
    fontWeight: 700
  },
  sessionSubtle: {
    marginTop: 4,
    color: "#5f5449"
  },
  sessionButton: {
    marginTop: 12,
    border: 0,
    borderRadius: 12,
    padding: "10px 12px",
    font: "inherit",
    cursor: "pointer",
    background: "#1d1b16",
    color: "white"
  },
  nav: {
    marginTop: 32,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  navItem: {
    padding: "12px 14px",
    borderRadius: 12,
    color: "#1d1b16",
    background: "rgba(255,255,255,0.7)",
    textDecoration: "none"
  },
  main: {
    padding: 32
  }
};
