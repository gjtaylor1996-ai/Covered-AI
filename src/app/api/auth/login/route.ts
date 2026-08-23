import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  createSessionToken,
  verifyPassword,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    // Same error for "no such user" and "wrong password" — don't leak
    // which one it was.
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await createSessionToken({ userId: user.id, role: user.role });
  const response = NextResponse.json({
    user: { id: user.id, email: user.email, role: user.role },
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return response;
}
