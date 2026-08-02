-- Stage attribution for judged submissions: epoch-ms marks (enqueued, dequeued, container
-- started, compile finished, last test finished) plus the BullMQ attempt number, recorded by
-- the worker and persisted by reconcile(). Nullable on purpose: submissions judged before this
-- column existed have no timings, and every reader treats absence as absence.
ALTER TABLE "Submission" ADD COLUMN "judgeTimings" JSONB;
