import { db } from "@/lib/db";
import type { Shift } from "@prisma/client";

/** Combines a Shift's date + "HH:MM" time strings into real Date instances. */
export function getShiftWindow(shift: Pick<Shift, "date" | "startTime" | "endTime">) {
  const day = shift.date.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const start = new Date(`${day}T${shift.startTime}:00`);
  let end = new Date(`${day}T${shift.endTime}:00`);
  if (end <= start) {
    // Overnight shift (e.g. 22:00 -> 02:00) — end lands the next day.
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

export function windowsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date }
): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Double-booking guard, spec §8.7 — shared by the offer endpoint and
 * the favourites "rebook" quick action, both of which assign a worker
 * to a shift. Application-level only; see the offer route's comment on
 * the database-level exclusion constraint this doesn't yet backstop.
 */
export async function isWorkerDoubleBooked(
  workerId: string,
  shift: Pick<Shift, "date" | "startTime" | "endTime">
): Promise<boolean> {
  const thisWindow = getShiftWindow(shift);
  const sameDayShifts = await db.shift.findMany({
    where: { workerId, status: { in: ["accepted", "confirmed"] }, date: shift.date },
  });
  return sameDayShifts.some((other) => windowsOverlap(thisWindow, getShiftWindow(other)));
}
