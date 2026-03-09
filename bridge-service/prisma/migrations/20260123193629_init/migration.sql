-- CreateTable
CREATE TABLE "sync_state" (
    "collection_uid" TEXT NOT NULL,
    "collection_name" TEXT,
    "test_plan_key" TEXT,
    "last_run_id" TEXT,
    "last_run_timestamp" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("collection_uid")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "runs_total" INTEGER NOT NULL DEFAULT 0,
    "runs_success" INTEGER NOT NULL DEFAULT 0,
    "runs_failed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "collection_uid" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "xray_exec_key" TEXT,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "sync_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
