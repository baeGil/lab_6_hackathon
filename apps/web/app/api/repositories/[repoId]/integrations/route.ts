import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStore } from "../../../../../../../packages/db/src/store";
import { getSessionCookieName, verifySession } from "../../../../../../../packages/shared/src/auth";
import type { RepoIntegrationInput } from "../../../../../../../packages/shared/src/index";

async function resolveUserAndRepository(repoId: string) {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(getSessionCookieName())?.value);
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const store = getStore();
  const repository = store.getTrackedRepositoryForUser(session.userId, repoId);
  if (!repository) {
    return { error: NextResponse.json({ error: "Repository not found for this user." }, { status: 404 }) };
  }

  return { store, session, repository };
}

export async function GET(_: Request, context: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await context.params;
  const resolved = await resolveUserAndRepository(repoId);
  if ("error" in resolved) {
    return resolved.error;
  }

  return NextResponse.json({
    repository: resolved.repository,
    integration: resolved.store.getRepoIntegration(resolved.session.userId, repoId)
  });
}

export async function POST(request: Request, context: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await context.params;
  const resolved = await resolveUserAndRepository(repoId);
  if ("error" in resolved) {
    return resolved.error;
  }

  const body = (await request.json()) as RepoIntegrationInput;
  const integration = resolved.store.saveRepoIntegration(resolved.session.userId, repoId, body);
  return NextResponse.json({
    ok: true,
    repository: resolved.repository,
    integration
  });
}
