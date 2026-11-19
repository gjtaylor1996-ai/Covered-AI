import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import {
  RESET_COOLDOWN_SECONDS,
  RESET_TOKEN_TTL_MINUTES,
  buildResetEmail,
  newResetToken,
} from "@/lib/password-reset";

const schema = z.object({ email: z.string().email() });

/**
 * Starts a password reset: emails a single-use link to the address if (and
 * only if) an account exists for it. The response is the same whether or not
 * an account exists, so this can't be used to find out who has an account.
 * Suspended accounts get no email. One email per account per minute.
 */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  // Until email is set up there is nothing to send. Say so honestly (this
  // reveals nothing about any account) instead of pretending an email went out.
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (user && !user.suspendedAt) {
    const since = new Date(Date.now() - RESET_COOLDOWN_SECONDS * 1000);
    const recent = await db.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: since } } });
    if (recent === 0) {
      const { token, tokenHash } = newResetToken();
      // Any earlier unused link stops working as soon as a new one is issued.
      await db.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await db.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000) },
      });
      const link = `${getSiteUrl()}/reset-password?token=${token}`;
      await sendEmail({ to: [user.email], ...buildResetEmail(link) });
    }
  }
  return NextResponse.json({ ok: true });
}
