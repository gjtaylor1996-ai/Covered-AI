import type { Shift } from "@prisma/client";
import { db } from "@/lib/db";

// Spec §8.7: an offer sitting past its respondBy deadline needs to flip
// back to "open" automatically. There's no job scheduler in this
// codebase yet (that's real infrastructure work, not a Phase 1
// concern), so this checks and flips lazily on every read/action
// instead of via a cron sweep. Swap for a real background job once
// there's a queue — see spec §6.
export async function expireIfPastDeadline(shift: Shift): Promise<Shift> {
  if (
    shift.status === "offered" &&
    shift.respondBy &&
    shift.respondBy.getTime() < Date.now()
  ) {
    return db.shift.update({
      where: { id: shift.id },
      data: { status: "open", workerId: null, offeredAt: null, respondBy: null },
    });
  }
  return shift;
}
