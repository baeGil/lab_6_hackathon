import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStore } from "../../../../../packages/db/src/store";
import { getSessionCookieName, verifySession } from "../../../../../packages/shared/src/auth";

export async function GET() {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(getSessionCookieName())?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const store = getStore();
  return NextResponse.json({
    repositories: store.listTrackedRepositoriesForUser(session.userId),
    status: store.getCredentialsStatus()
  });
}
