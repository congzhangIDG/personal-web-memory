import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), "prisma/dev.db");

declare global {
  // eslint-disable-next-line no-var
  var __pwmPrisma: PrismaClient | undefined;
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalThis.__pwmPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__pwmPrisma = prisma;
}
