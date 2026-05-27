import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDigestSummary } from "@/lib/summary";
import type { DomainStat } from "@pwm/shared";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { date?: string };
  if (!body.date) {
    return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });
  }

  const { date } = body;

  // 1) 获取该日所有页面
  const pages = await prisma.pageVisit.findMany({
    where: { date },
  });

  if (pages.length === 0) {
    return NextResponse.json({ error: "no pages found for this date" }, { status: 404 });
  }

  // 2) 聚合统计
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

  // 3) 生成新的摘要
  const newSummary = await getDigestSummary({
    date,
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

  if (!newSummary) {
    return NextResponse.json({ error: "failed to generate summary" }, { status: 500 });
  }

  // 4) 更新 digest
  await prisma.dailyDigest.update({
    where: { date },
    data: { summary: newSummary },
  });

  return NextResponse.json({ ok: true, summary: newSummary });
}
