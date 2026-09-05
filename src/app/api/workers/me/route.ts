import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { roleRequiresDbs } from "@/lib/verification";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";

const WORKER_ROLE_KEYS = Object.keys(WORKER_ROLE_LABELS) as [
  WorkerRoleKey,
  ...WorkerRoleKey[],
];

/** Full profile, own view — spec §4. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }
  const cv = await db.workerCv.findUnique({
    where: { workerId: worker.id },
    select: { fileName: true },
  });
  return NextResponse.json({ worker: { ...worker, cvFileName: cv?.fileName ?? null } });
}

const dayAvailabilitySchema = z.object({
  enabled: z.boolean(),
  start: z.string(),
  end: z.string(),
});

const availabilitySchema = z.object({
  monday: dayAvailabilitySchema,
  tuesday: dayAvailabilitySchema,
  wednesday: dayAvailabilitySchema,
  thursday: dayAvailabilitySchema,
  friday: dayAvailabilitySchema,
  saturday: dayAvailabilitySchema,
  sunday: dayAvailabilitySchema,
});

const updateSchema = z.object({
  primaryRole: z.enum(WORKER_ROLE_KEYS).optional(),
  yearsExperience: z.number().min(0).optional(),
  hourlyRate: z.number().positive().optional(),
  postcode: z.string().min(1).optional(),
  maxTravelDistanceMi: z.number().positive().optional(),
  availability: availabilitySchema.optional(),
});

/** Update availability, rate, travel radius — spec §4. */
export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const data: Record<string, unknown> = { ...parsed.data };

  // Spec §8.6: a role change can flip whether DBS applies at all. Only
  // touch dbsStatus when it's currently the "no check needed" state or
  // the role no longer needs one — never silently clear an in-progress
  // or completed check by re-saving an unrelated field.
  if (parsed.data.primaryRole && parsed.data.primaryRole !== worker.primaryRole) {
    const nowRequiresDbs = roleRequiresDbs(parsed.data.primaryRole);
    if (nowRequiresDbs && worker.dbsStatus === "not_required") {
      data.dbsStatus = "pending";
    } else if (!nowRequiresDbs) {
      data.dbsStatus = "not_required";
    }
  }

  const updated = await db.workerProfile.update({ where: { id: worker.id }, data });
  return NextResponse.json({ worker: updated });
}
