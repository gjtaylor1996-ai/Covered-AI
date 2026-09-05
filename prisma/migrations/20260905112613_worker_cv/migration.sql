-- CreateTable
CREATE TABLE "worker_cvs" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_cvs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worker_cvs_workerId_key" ON "worker_cvs"("workerId");

-- AddForeignKey
ALTER TABLE "worker_cvs" ADD CONSTRAINT "worker_cvs_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
