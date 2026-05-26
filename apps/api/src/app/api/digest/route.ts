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
    await prisma.pageVisit.deleteMany({ where: { date } });
    await prisma.pageVisit.createMany({
      data: pages.map((p) => ({
        url: p.url,
        title: p.title,
        domain: p.domain,
        visitedAt: p.visitedAt,
        durationMs: p.durationMs ?? 0,
        summary: p.summary ?? "",
        topics: JSON.stringify(p.topics ?? []),
        favorited: false,
        date,
      })),
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
