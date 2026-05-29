import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDigestSummary, generatePageSummary } from "@/lib/summary";
import { generateTopicsForPages } from "@/lib/topics";
import {
  uploadDigestRequestSchema,
  type UploadDigestResponse,
  type GetDigestsResponse,
} from "@pwm/shared";
import fs from "node:fs";
import path from "node:path";

const CONTENT_ROOT = path.resolve(process.cwd(), "content");

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
    textContent?: string;
  }>();

  if (pages && pages.length > 0) {
    for (const p of pages) {
      const existing = urlMap.get(p.url);
      if (existing) {
        existing.durationMs += p.durationMs ?? 0;
        if (p.visitedAt > existing.visitedAt) {
          existing.visitedAt = p.visitedAt;
          existing.title = p.title;
          if (p.textContent) existing.textContent = p.textContent;
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
          textContent: p.textContent,
        });
      }
    }
  }

  const dedupedPages = [...urlMap.values()];

  // ── 2. 先入库（确保数据不丢失）──
  await prisma.dailyDigest.upsert({
    where: { date },
    create: {
      date,
      summary: summary.trim() || "",
      pageCount,
      totalDurationMs,
      topDomains: JSON.stringify(topDomains),
      topics: JSON.stringify(topics ?? []),
    },
    update: {
      summary: summary.trim() || undefined,
      pageCount,
      totalDurationMs,
      topDomains: JSON.stringify(topDomains),
    },
  });

  for (const p of dedupedPages) {
    const record = await prisma.pageVisit.upsert({
      where: { url_date: { url: p.url, date } },
      create: {
        url: p.url,
        title: p.title,
        domain: p.domain,
        visitedAt: p.visitedAt,
        durationMs: p.durationMs,
        summary: p.summary || "",
        topics: JSON.stringify(p.topics ?? []),
        favorited: p.favorited,
        date,
      },
      update: {
        title: p.title,
        visitedAt: p.visitedAt,
        durationMs: p.durationMs,
      },
    });

    // 持久化扩展端提取的页面文本内容
    if (p.textContent) {
      const dir = path.join(CONTENT_ROOT, date);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${record.id}.txt`), p.textContent, "utf-8");
    }
  }

  // ── 3. AI 补全（失败不影响已入库数据）──
  try {
    // 查询已存在的页面摘要/主题，避免重复 AI 调用
    const existingPages = dedupedPages.length > 0
      ? await prisma.pageVisit.findMany({
          where: { date, url: { in: dedupedPages.map((p) => p.url) } },
          select: { url: true, summary: true },
        })
      : [];
    const existingSummaryMap = new Map(
      existingPages.map((p) => [p.url, p.summary]),
    );

    // 3a. 生成主题标签（只对尚无 topic 的页面）
    const topicMap = dedupedPages.length > 0
      ? await generateTopicsForPages(
          dedupedPages
            .filter((p) => !existingSummaryMap.get(p.url)?.trim())
            .map((p) => ({ url: p.url, title: p.title, domain: p.domain })),
        )
      : new Map<string, string[]>();

    // 3b. 生成页面摘要（只对无摘要且本次有 textContent 的页面）
    for (const p of dedupedPages) {
      const existingSummary = existingSummaryMap.get(p.url);
      if (existingSummary?.trim()) {
        p.summary = existingSummary;
      } else if (!p.summary?.trim() && p.textContent) {
        const pageSummary = await generatePageSummary(p.url, p.title, p.textContent);
        if (pageSummary) p.summary = pageSummary;
      }
    }

    // 3c. 生成日总结
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

    // 3d. 合并主题标签
    const allTopics = [
      ...new Set(
        dedupedPages.flatMap((p) => {
          const generated = topicMap.get(p.url) ?? [];
          return p.topics.length > 0 ? p.topics : generated;
        }),
      ),
    ].slice(0, 20);

    // 3e. 回写 AI 结果到 DB
    await prisma.dailyDigest.update({
      where: { date },
      data: {
        summary: resolvedSummary,
        topics: JSON.stringify(allTopics),
      },
    });

    for (const p of dedupedPages) {
      const generatedTopics = topicMap.get(p.url) ?? [];
      const finalTopics = p.topics.length > 0 ? p.topics : generatedTopics;

      await prisma.pageVisit.update({
        where: { url_date: { url: p.url, date } },
        data: {
          summary: p.summary || undefined,
          topics: JSON.stringify(finalTopics),
        },
      });
    }
  } catch (aiError) {
    console.error("[digest] AI enrichment failed, raw data preserved:", aiError);
  }

  const res: UploadDigestResponse = { ok: true, date, pagesUpserted: dedupedPages.length };
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
