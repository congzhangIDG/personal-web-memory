// PrismaClient 单例：避免 Next.js dev 热重载产生多个连接
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __pwmPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__pwmPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__pwmPrisma = prisma;
}
