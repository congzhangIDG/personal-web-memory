-- CreateTable
CREATE TABLE "DailyDigest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "totalDurationMs" INTEGER NOT NULL,
    "topDomains" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyDigest_date_key" ON "DailyDigest"("date");

-- CreateIndex
CREATE INDEX "DailyDigest_date_idx" ON "DailyDigest"("date");
