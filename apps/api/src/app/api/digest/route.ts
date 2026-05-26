import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDigestSummary } from "@/lib/summary";
import {
  uploadDigestRequestSchema,
  type UploadDigestResponse,
  type GetDigestsResponse,
} from "@pwm/shared";

// 禁止 Next.js build 时预渲染此路由
export const dynamic = "force-dynamic";

// POST /api/digest — 接收扩展上传的 DailyDigest，upsert 到 SQLite
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = uploadDigestRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { date, summary, pageCount, totalDurationMs, topDomains } = parsed.data;
  const resolvedSummary = summary.trim()
    ? summary.trim()
    : await getDigestSummary({
        date,
        pageCount,
        totalDurationMs,
        topDomains,
      });

  await prisma.dailyDigest.upsert({
    where: { date },
    create: {
      date,
      summary: resolvedSummary,
      pageCount,
      totalDurationMs,
      topDomains: JSON.stringify(topDomains),
    },
    update: {
      summary: resolvedSummary,
      pageCount,
      totalDurationMs,
      topDomains: JSON.stringify(topDomains),
    },
  });

  const res: UploadDigestResponse = { ok: true, date };
  return NextResponse.json(res, { status: 200 });
}

// GET /api/digest — 返回所有 DailyDigest，按日期倒序
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
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  const res: GetDigestsResponse = { items };
  return NextResponse.json(res);
}
