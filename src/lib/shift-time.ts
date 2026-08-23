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
