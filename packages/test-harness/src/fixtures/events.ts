import type { WebhookEvent } from "../../../shared/src/index";

function baseEvent(): WebhookEvent {
  return {
    deliveryId: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    snapshot: {
      repoId: "repo-1",
      repoName: "demo/repo",
      prNumber: 101,
      title: "Harden auth pipeline and rollout config",
      author: "alice",
      url: "https://github.com/demo/repo/pull/101",
      baseBranch: "main",
      headBranch: "feature/harden-auth",
      eventType: "opened",
      labels: ["security", "backend"],
      reviewers: ["bob", "carol"],
      files: [
        {
          path: "src/auth/session.ts",
          patch: '+if (!token) throw new Error("missing token");',
          additions: 6,
          deletions: 1
        },
        {
          path: "src/config/runtime.ts",
          patch: '+export const AUTH_TOKEN = "sk-1234567890abcdefghijkl";',
          additions: 2,
          deletions: 0
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

export function createSmallPrEvent() {
  return baseEvent();
}

export function createLargePrEvent() {
  const event = baseEvent();
  event.snapshot.prNumber = 102;
  event.deliveryId = crypto.randomUUID();
  event.snapshot.title = "Refactor service boundaries across the payments flow";
  event.snapshot.files = new Array(30).fill(null).map((_, index) => ({
    path: `src/payments/module-${index}.ts`,
    patch: `+export const value${index} = ${index};\n+// auth migration config retry queue state`,
    additions: 8,
    deletions: 3
  }));
  return event;
}

export function createDuplicateEvent() {
  return baseEvent();
}
