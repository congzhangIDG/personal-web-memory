-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyDigest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "totalDurationMs" INTEGER NOT NULL,
    "topDomains" TEXT NOT NULL,
    "topics" TEXT NOT NULL DEFAULT '[]',
    "favorited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DailyDigest" ("createdAt", "date", "id", "pageCount", "summary", "topDomains", "totalDurationMs", "updatedAt") SELECT "createdAt", "date", "id", "pageCount", "summary", "topDomains", "totalDurationMs", "updatedAt" FROM "DailyDigest";
DROP TABLE "DailyDigest";
ALTER TABLE "new_DailyDigest" RENAME TO "DailyDigest";
CREATE UNIQUE INDEX "DailyDigest_date_key" ON "DailyDigest"("date");
CREATE INDEX "DailyDigest_date_idx" ON "DailyDigest"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
