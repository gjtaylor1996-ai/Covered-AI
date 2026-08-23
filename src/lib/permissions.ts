import { db } from "@/lib/db";

// Resolves "me" for venue-scoped actions via the requesting user's
// VenueMember row, per spec §8.3 — Venue has no direct userId field.
// A user can belong to multiple venues in the schema, but nothing in the
// product yet lets someone pick which one they're acting as, so this
// takes their first membership. Revisit once multi-venue switching is a
// real feature.
export async function getVenueMembership(userId: string) {
  return db.venueMember.findFirst({
    where: { userId },
    include: { venue: true },
  });
}

export function canPostShifts(role: "owner" | "manager" | "staff"): boolean {
  // Permission matrix, spec §8.4: owner/manager/staff can all post/edit
  // shifts; only owner/manager can create hire requests, only owner
  // handles billing/member invites. This module only needs the shifts
  // row for Phase 1.
  return role === "owner" || role === "manager" || role === "staff";
}

export async function getWorkerProfile(userId: string) {
  return db.workerProfile.findUnique({ where: { userId } });
}
