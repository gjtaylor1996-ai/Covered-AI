import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";

const MAX_CV_BYTES = 4 * 1024 * 1024; // stays well under Vercel's ~4.5MB request body limit

/** Uploads (or replaces) the worker's own CV. PDF only, optional. */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("cv");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "pdf_only" }, { status: 400 });
  }
  if (file.size > MAX_CV_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  await db.workerCv.upsert({
    where: { workerId: worker.id },
    create: { workerId: worker.id, fileName: file.name, mimeType: file.type, data },
    update: { fileName: file.name, mimeType: file.type, data, uploadedAt: new Date() },
  });

  return NextResponse.json({ fileName: file.name });
}

/** Removes the worker's own CV. */
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }

  await db.workerCv.deleteMany({ where: { workerId: worker.id } });
  return NextResponse.json({ removed: true });
}
