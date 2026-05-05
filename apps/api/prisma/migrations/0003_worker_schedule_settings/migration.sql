ALTER TABLE "WorkerProfile" ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkerProfile" ADD COLUMN "bookingWindowDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "WorkerProfile" ADD COLUMN "minimumNoticeMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AvailabilityWindow" ADD COLUMN "location" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "location" TEXT;
