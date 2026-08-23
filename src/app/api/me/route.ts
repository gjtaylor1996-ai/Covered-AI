import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      workerProfile: { select: { id: true, name: true, bankAccountConnected: true } },
      venueMemberships: {
        select: {
          role: true,
          venue: { select: { id: true, name: true, stripeCustomerId: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  return NextResponse.json({ user });
}
