import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePageSummary, getDigestSummary } from "@/lib/summary";
import type { DomainStat } from "@pwm/shared";

export const dynamic = "force-dynamic";

type BackfillResult = {
  pagesProcessed: number;
  pagesSucceeded: number;
  pagesFailed: number;
  digestsProcessed: number;
  digestsSucceeded: number;
  digestsFailed: number;
  errors: string[];
};

export async function POST() {
  const result: BackfillResult = {
    pagesProcessed: 0,
    pagesSucceeded: 0,
    pagesFailed: 0,
    digestsProcessed: 0,
    digestsSucceeded: 0,
    digestsFailed: 0,
    errors: [],
  };

  // ── 1. 回填空摘要的页面（URL 抓取 + LLM）──
  const emptyPages = await prisma.pageVisit.findMany({
    where: { summary: "" },
    orderBy: { visitedAt: "desc" },
    take: 200,
  });

  for (const page of emptyPages) {
    result.pagesProcessed++;
    try {
      const summary = await generatePageSummary(page.url, page.title);
      if (summary) {
        await prisma.pageVisit.update({
          where: { id: page.id },
          data: { summary },
        });
        result.pagesSucceeded++;
      } else {
        result.pagesFailed++;
      }
    } catch (error) {
      result.pagesFailed++;
      result.errors.push(`[page ${page.id}] ${page.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ── 2. 重新生成所有日总结（基于数据库已有页面数据）──
  const digests = await prisma.dailyDigest.findMany({
    orderBy: { date: "desc" },
  });

  for (const digest of digests) {
    result.digestsProcessed++;
    try {
      const pages = await prisma.pageVisit.findMany({
        where: { date: digest.date },
      });

      if (pages.length === 0) {
        result.digestsSucceeded++;
        continue;
      }

      // 聚合 domain 统计
      const domainMap = new Map<string, { count: number; durationMs: number }>();
      let totalDurationMs = 0;
      for (const p of pages) {
        totalDurationMs += p.durationMs;
        const d = domainMap.get(p.domain) ?? { count: 0, durationMs: 0 };
        d.count++;
        d.durationMs += p.durationMs;
        domainMap.set(p.domain, d);
      }
      const topDomains: DomainStat[] = [...domainMap.entries()]
        .sort((a, b) => b[1].durationMs - a[1].durationMs)
        .slice(0, 10)
        .map(([domain, stat]) => ({ domain, count: stat.count, durationMs: stat.durationMs }));

      const newSummary = await getDigestSummary({
        date: digest.date,
        pageCount: pages.length,
        totalDurationMs,
        topDomains,
        pages: pages.map((p) => ({
          title: p.title,
          url: p.url,
          domain: p.domain,
          durationMs: p.durationMs,
          summary: p.summary || undefined,
        })),
      });

      if (newSummary) {
        await prisma.dailyDigest.update({
          where: { date: digest.date },
          data: { summary: newSummary },
        });
        result.digestsSucceeded++;
      } else {
        result.digestsFailed++;
      }
    } catch (error) {
      result.digestsFailed++;
      result.errors.push(`[digest ${digest.date}] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return NextResponse.json(result);
}
