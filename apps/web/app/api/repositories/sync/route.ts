import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStore } from "../../../../../../packages/db/src/store";
import { fetchTrackedRepositoriesForUser } from "../../../../../../packages/integrations/src/github";
import { getSessionCookieName, verifySession } from "../../../../../../packages/shared/src/auth";

export async function POST() {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(getSessionCookieName())?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const store = getStore();
  const accessToken = store.getUserAccessToken(session.userId);
  if (!accessToken) {
    return NextResponse.json({ error: "Missing GitHub account token. Sign in with GitHub again." }, { status: 400 });
  }

  try {
    const repositories = await fetchTrackedRepositoriesForUser(accessToken);
    const tracked = store.replaceTrackedRepositoriesForUser(session.userId, repositories);
    return NextResponse.json({
      repositories: tracked,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to sync repositories."
      },
      { status: 502 }
    );
  }
}
