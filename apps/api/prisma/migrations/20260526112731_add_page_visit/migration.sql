-- CreateTable
CREATE TABLE "PageVisit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "visitedAt" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "topics" TEXT NOT NULL DEFAULT '[]',
    "favorited" BOOLEAN NOT NULL DEFAULT false,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageVisit_date_fkey" FOREIGN KEY ("date") REFERENCES "DailyDigest" ("date") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PageVisit_date_idx" ON "PageVisit"("date");

-- CreateIndex
CREATE INDEX "PageVisit_favorited_idx" ON "PageVisit"("favorited");

-- CreateIndex
CREATE UNIQUE INDEX "PageVisit_url_date_key" ON "PageVisit"("url", "date");
