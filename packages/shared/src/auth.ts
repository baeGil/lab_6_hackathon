import { ensureRootEnvLoaded } from "./env";
import type { AuthenticatedUser } from "./index";
import crypto from "node:crypto";

ensureRootEnvLoaded();

export interface UserSession extends AuthenticatedUser {}

const SESSION_COOKIE = "printel_session";
const STATE_COOKIE = "printel_oauth_state";

function getSecret() {
  return process.env.APP_MASTER_KEY ?? "change-me";
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function getStateCookieName() {
  return STATE_COOKIE;
}

export function generateOauthState() {
  return crypto.randomBytes(24).toString("hex");
}

export function buildUserId(githubId: string) {
  return `github:${githubId}`;
}

export function signSession(session: UserSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  if (signature !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UserSession;
  } catch {
    return null;
  }
}
