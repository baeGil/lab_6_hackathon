import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStore } from "../../../../../../../packages/db/src/store";
import { getSessionCookieName, verifySession } from "../../../../../../../packages/shared/src/auth";

export async function POST(request: Request, context: { params: Promise<{ repoId: string }> }) {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(getSessionCookieName())?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { repoId } = await context.params;
  const body = (await request.json()) as { enabled: boolean };
  const store = getStore();
  const repository = store.getTrackedRepositoryForUser(session.userId, repoId);
  if (!repository) {
    return NextResponse.json({ error: "Repository not found for this user." }, { status: 404 });
  }

  if (!repository.installationId) {
    return NextResponse.json(
      { error: "This repository is not installed under your GitHub App yet. Install the app on GitHub, then sync again." },
      { status: 400 }
    );
  }

  try {
    store.setRepositoryWebhookConfigured(session.userId, repoId, body.enabled);
    const tracked = store.setRepositoryTracking(session.userId, repoId, body.enabled);
    return NextResponse.json({ ok: true, repository: tracked });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update repository tracking." },
      { status: 502 }
    );
  }
}
