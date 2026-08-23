import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  createSessionToken,
  hashPassword,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["worker", "venue_admin"]),
  // Minimal profile stub fields — full profile completion happens later
  // in onboarding, per the prototypes.
  name: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { email, password, role, name } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "email_already_registered" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      role,
      ...(role === "worker"
        ? {
            workerProfile: {
              create: {
                name,
                primaryRole: "Bartender",
                yearsExperience: 0,
                hourlyRate: 0,
                postcode: "",
                maxTravelDistanceMi: 10,
                availability: {
                  monday: { enabled: false, start: "09:00", end: "17:00" },
                  tuesday: { enabled: false, start: "09:00", end: "17:00" },
                  wednesday: { enabled: false, start: "09:00", end: "17:00" },
                  thursday: { enabled: false, start: "09:00", end: "17:00" },
                  friday: { enabled: false, start: "09:00", end: "17:00" },
                  saturday: { enabled: false, start: "09:00", end: "17:00" },
                  sunday: { enabled: false, start: "09:00", end: "17:00" },
                },
              },
            },
          }
        : {
            venueMemberships: {
              create: {
                role: "owner",
                joinedAt: new Date(),
                venue: {
                  create: {
                    name,
                    postcode: "",
                  },
                },
              },
            },
          }),
    },
  });

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
