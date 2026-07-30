-- CreateTable
CREATE TABLE "ScheduleRequestLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleRequestLog_userId_createdAt_idx" ON "ScheduleRequestLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ScheduleRequestLog" ADD CONSTRAINT "ScheduleRequestLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
