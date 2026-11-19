import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { hashResetToken } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200),
});

/**
 * Finishes a password reset: checks the emailed token (single-use, one hour),
 * sets the new password and uses up every outstanding reset link for the
 * account. Does not sign the person in; they log in with the new password.
 */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } }),
  ]);
  return NextResponse.json({ ok: true });
}
