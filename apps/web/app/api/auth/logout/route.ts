import { NextResponse } from "next/server";
import { getSessionCookieName, getStateCookieName } from "../../../../../../packages/shared/src/auth";

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = NextResponse.redirect(appUrl);
  response.cookies.delete(getSessionCookieName());
  response.cookies.delete(getStateCookieName());
  return response;
}
