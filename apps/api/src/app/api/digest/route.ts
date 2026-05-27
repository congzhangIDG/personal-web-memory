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

  // ── 1. 去重 ──
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

  if (pages && pages.length > 0) {
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
  }

  const dedupedPages = [...urlMap.values()];

  // ── 2. 生成主题标签 ──
  const topicMap = dedupedPages.length > 0
    ? await generateTopicsForPages(
        dedupedPages.map((p) => ({ url: p.url, title: p.title, domain: p.domain })),
      )
    : new Map<string, string[]>();

  // ── 3. 生成页面摘要（先于日总结，确保 digest summary 能引用到）──
  for (const p of dedupedPages) {
    if (!p.summary?.trim()) {
      const pageSummary = await generatePageSummary(p.url, p.title);
      if (pageSummary) p.summary = pageSummary;
    }
  }

  // ── 4. 生成日总结（含各页面摘要信息）──
  const resolvedSummary = summary.trim()
    ? summary.trim()
    : await getDigestSummary({
        date,
        pageCount,
        totalDurationMs,
        topDomains,
        pages: dedupedPages.map((p) => ({
          title: p.title,
          url: p.url,
          domain: p.domain,
          durationMs: p.durationMs,
          summary: p.summary,
        })),
      });

  // ── 5. 合并该日所有页面的主题标签 ──
  const allTopics = [
    ...new Set(
      dedupedPages.flatMap((p) => {
        const generated = topicMap.get(p.url) ?? [];
        return p.topics.length > 0 ? p.topics : generated;
      }),
    ),
  ].slice(0, 20);

  // ── 6. 写入 digest ──
  await prisma.dailyDigest.upsert({
    where: { date },
    create: {
      date,
      summary: resolvedSummary,
      pageCount,
      totalDurationMs,
      topDomains: JSON.stringify(topDomains),
      topics: JSON.stringify(allTopics),
    },
    update: {
      summary: resolvedSummary,
      pageCount,
      totalDurationMs,
      topDomains: JSON.stringify(topDomains),
      topics: JSON.stringify(allTopics),
    },
  });

  // ── 7. 写入各页面 ──
  for (const p of dedupedPages) {
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
