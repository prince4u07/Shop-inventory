import * as jose from "jose";
import { cookies } from "next/headers";
import type { UserRole } from "./database.types";

export const SESSION_COOKIE = "shop_session";
const SESSION_MAX_AGE = 60 * 60 * 12; // 12h — one shop shift + buffer

export interface Session {
  sub: string;
  role: UserRole;
  name: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Missing AUTH_SECRET (min 32 chars). Add it to .env.local — see .env.example."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: Session): Promise<string> {
  return await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    if (
      typeof payload.sub !== "string" ||
      (payload.role !== "owner" && payload.role !== "staff")
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      role: payload.role,
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return null;
  }
}

/** Read + verify the session cookie. Null when logged out / expired / invalid. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AuthError("Not authenticated", 401);
  return session;
}

export async function requireOwner(): Promise<Session> {
  const session = await requireUser();
  if (session.role !== "owner") throw new AuthError("Owner only", 403);
  return session;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
