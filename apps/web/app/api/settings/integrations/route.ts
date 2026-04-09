import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStore } from "../../../../../../packages/db/src/store";
import { getSessionCookieName, verifySession } from "../../../../../../packages/shared/src/auth";

export async function GET() {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(getSessionCookieName())?.value);
  const store = getStore();
  return NextResponse.json({
    status: store.getCredentialsStatusForUser(session?.userId)
  });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(getSessionCookieName())?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await request.json().catch(() => ({}));
  return NextResponse.json({
    ok: true,
    status: getStore().getCredentialsStatusForUser(session.userId)
  });
}
