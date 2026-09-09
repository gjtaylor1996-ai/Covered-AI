import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { isWithinResubmissionCooldown } from "@/lib/verification";

const shareCodeSchema = z.object({
  method: z.literal("share_code"),
  shareCode: z.string().regex(/^[A-Za-z0-9]{9}$/, "Share code must be 9 characters"),
  dateOfBirth: z.string(),
});

const manualDocumentSchema = z.object({
  method: z.literal("manual_document"),
  nationality: z.enum(["British", "Irish"]),
  passportNumber: z.string().min(1),
  dateOfBirth: z.string(),
});

const schema = z.discriminatedUnion("method", [shareCodeSchema, manualDocumentSchema]);

/**
 * Two right-to-work methods, neither with a self-serve API:
 *
 * - share_code: the Home Office online checking service. The worker
 *   generates a code at gov.uk/prove-right-to-work; an admin looks it
 *   up at gov.uk/view-right-to-work.
 * - manual_document: British and Irish citizens are never issued a
 *   share code at all (they're not subject to immigration control), so
 *   this method doesn't apply to them. Instead an admin must physically
 *   inspect the original passport in person — this route only records
 *   what the worker declares so the admin knows who to check and
 *   against what document; it can never itself confirm anything.
 *
 * Either way this leaves rightToWorkStatus at "pending" — an admin
 * always makes the final call, via
 * /api/admin/verification/[workerId]/override.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }

  if (
    worker.rightToWorkStatus === "rejected" &&
    isWithinResubmissionCooldown(worker.rightToWorkSubmittedAt)
  ) {
    return NextResponse.json({ error: "resubmission_cooldown" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const base = {
    rightToWorkStatus: "pending" as const,
    rightToWorkSubmittedAt: new Date(),
  };

  const data =
    parsed.data.method === "share_code"
      ? {
          ...base,
          rightToWorkMethod: "share_code" as const,
          rightToWorkShareCode: parsed.data.shareCode.toUpperCase(),
          rightToWorkDob: new Date(parsed.data.dateOfBirth),
          rightToWorkNationality: null,
          rightToWorkPassportNumber: null,
        }
      : {
          ...base,
          rightToWorkMethod: "manual_document" as const,
          rightToWorkNationality: parsed.data.nationality,
          rightToWorkPassportNumber: parsed.data.passportNumber,
          rightToWorkDob: new Date(parsed.data.dateOfBirth),
          rightToWorkShareCode: null,
        };

  const updated = await db.workerProfile.update({ where: { id: worker.id }, data });

  return NextResponse.json({ worker: updated });
}
