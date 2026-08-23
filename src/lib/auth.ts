import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "covered_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short — set a real 32+ byte value in .env (see .env.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export interface SessionPayload {
  userId: string;
  role: "worker" | "venue_admin" | "admin";
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.userId !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { userId: payload.userId, role: payload.role as SessionPayload["role"] };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;

export async function getSessionFromRequest(
  request: NextRequest
): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
