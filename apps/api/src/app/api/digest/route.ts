import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDigestSummary } from "@/lib/summary";
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
    // 按 URL 去重：累计时长，取最后访问时间
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

    for (const p of dedupedPages) {
      await prisma.pageVisit.upsert({
        where: { url_date: { url: p.url, date } },
        create: {
          url: p.url,
          title: p.title,
          domain: p.domain,
          visitedAt: p.visitedAt,
          durationMs: p.durationMs,
          summary: p.summary,
          topics: JSON.stringify(p.topics),
          favorited: p.favorited,
          date,
        },
        update: {
          title: p.title,
          visitedAt: p.visitedAt,
          durationMs: { increment: p.durationMs },
        },
      });
    }
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
