import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDigestSummary, generatePageSummary } from "@/lib/summary";
import { generateTopicsForPages } from "@/lib/topics";
import {
  uploadDigestRequestSchema,
  type UploadDigestResponse,
  type GetDigestsResponse,
} from "@pwm/shared";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = uploadDigestRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { date, summary, pageCount, totalDurationMs, topDomains, topics, pages } = parsed.data;
  const resolvedSummary = summary.trim()
    ? summary.trim()
    : await getDigestSummary({
        date,
        pageCount,
        totalDurationMs,
        topDomains,
        pages: pages?.map((p) => ({
          title: p.title,
          url: p.url,
          domain: p.domain,
          durationMs: p.durationMs ?? 0,
        })),
      });

  // 1) 先创建/更新 digest（确保外键存在，PageVisit 依赖它）
  await prisma.dailyDigest.upsert({
    where: { date },
    create: {
      date,
      summary: resolvedSummary,
      pageCount,
      totalDurationMs,
      topDomains: JSON.stringify(topDomains),
      topics: JSON.stringify(topics ?? []),
    },
    update: {
      summary: resolvedSummary,
      pageCount,
      totalDurationMs,
      topDomains: JSON.stringify(topDomains),
      topics: JSON.stringify(topics ?? []),
    },
  });


  if (pages && pages.length > 0) {
    const urlMap = new Map<string, {
      url: string;
      title: string;
      domain: string;
      visitedAt: number;
      durationMs: number;
      summary: string;
      topics: string[];
      favorited: boolean;
    }>();

    for (const p of pages) {
      const existing = urlMap.get(p.url);
      if (existing) {
        existing.durationMs += p.durationMs ?? 0;
        if (p.visitedAt > existing.visitedAt) {
          existing.visitedAt = p.visitedAt;
          existing.title = p.title;
        }
      } else {
        urlMap.set(p.url, {
          url: p.url,
          title: p.title,
          domain: p.domain,
          visitedAt: p.visitedAt,
          durationMs: p.durationMs ?? 0,
          summary: p.summary ?? "",
          topics: p.topics ?? [],
          favorited: false,
        });
      }
    }

    const dedupedPages = [...urlMap.values()];

    const topicMap = await generateTopicsForPages(
      dedupedPages.map((p) => ({ url: p.url, title: p.title, domain: p.domain })),
    );

    for (const p of dedupedPages) {
      // 自动生成页面摘要（仅对空 summary 生效）
      if (!p.summary?.trim()) {
        const pageSummary = await generatePageSummary(p.url, p.title);
        if (pageSummary) p.summary = pageSummary;
      }

      const generatedTopics = topicMap.get(p.url) ?? [];
      const finalTopics = p.topics.length > 0 ? p.topics : generatedTopics;

      await prisma.pageVisit.upsert({
        where: { url_date: { url: p.url, date } },
        create: {
          url: p.url,
          title: p.title,
          domain: p.domain,
          visitedAt: p.visitedAt,
          durationMs: p.durationMs,
          summary: p.summary,
          topics: JSON.stringify(finalTopics),
          favorited: p.favorited,
          date,
        },
        update: {
          title: p.title,
          visitedAt: p.visitedAt,
          durationMs: { increment: p.durationMs },
          topics: JSON.stringify(finalTopics),
        },
      });
    }

    // 3) 重新聚合该日所有页面的 topics（保证多次上传不覆盖）
    const allDatePages = await prisma.pageVisit.findMany({
      where: { date },
      select: { topics: true },
    });
    const allDateTopics = [
      ...new Set(
        allDatePages.flatMap((p) => {
          try { return JSON.parse(p.topics) as string[]; } catch { return []; }
        }),
      ),
    ].slice(0, 20);

    await prisma.dailyDigest.update({
      where: { date },
      data: { topics: JSON.stringify(allDateTopics) },
    });
  }

  const res: UploadDigestResponse = { ok: true, date };
  return NextResponse.json(res, { status: 200 });
}

export async function GET() {
  const rows = await prisma.dailyDigest.findMany({
    orderBy: { date: "desc" },
  });

  const items = rows.map((r: typeof rows[number]) => ({
    date: r.date,
    summary: r.summary,
    pageCount: r.pageCount,
    totalDurationMs: r.totalDurationMs,
    topDomains: JSON.parse(r.topDomains),
    topics: JSON.parse(r.topics),
    favorited: r.favorited,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  const res: GetDigestsResponse = { items };
  return NextResponse.json(res);
}
