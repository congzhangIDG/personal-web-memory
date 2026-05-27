import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePageSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

type BackfillResult = {
  processed: number;
  succeeded: number;
  failed: number;
  total: number;
  errors: string[];
};

export async function POST() {
  const result: BackfillResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    total: 0,
    errors: [],
  };

  // 查找所有摘要为空的页面记录
  const emptyPages = await prisma.pageVisit.findMany({
    where: { summary: "" },
    orderBy: { visitedAt: "desc" },
    take: 200,
  });

  result.total = emptyPages.length;

  for (const page of emptyPages) {
    result.processed++;
    try {
      const summary = await generatePageSummary(page.url, page.title);
      if (summary) {
        await prisma.pageVisit.update({
          where: { id: page.id },
          data: { summary },
        });
        result.succeeded++;
      } else {
        result.failed++;
      }
    } catch (error) {
      result.failed++;
      result.errors.push(`[${page.id}] ${page.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return NextResponse.json(result);
}
