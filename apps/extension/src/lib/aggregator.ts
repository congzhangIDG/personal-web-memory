// 每日聚合模块
// 将某日的 PageRecord[] 聚合为 DailyDigest 并写入本地 digests 表。

import { db } from "./db";
import type { DailyDigest, DomainStat } from "@pwm/shared";

/**
 * 将 YYYY-MM-DD 转为当天 00:00:00 和次日 00:00:00 的毫秒 epoch（本地时区）
 */
function dateRange(dateStr: string): { start: number; end: number } {
  const d = new Date(dateStr + "T00:00:00");
  const start = d.getTime();
  const end = start + 86_400_000;
  return { start, end };
}

/**
 * 聚合指定日期的 PageRecord 并写入 digests 表。
 * 若当天已有摘要则覆盖。
 * @param dateStr YYYY-MM-DD
 * @returns 生成的 DailyDigest 或 null（当天无记录时）
 */
export async function buildDailyDigest(
  dateStr: string,
): Promise<DailyDigest | null> {
  const { start, end } = dateRange(dateStr);

  const pages = await db.pages
    .where("visitedAt")
    .between(start, end, true, false)
    .toArray();

  if (pages.length === 0) return null;

  // 按 domain 聚合
  const domainMap = new Map<string, { count: number; durationMs: number }>();
  let totalDurationMs = 0;

  for (const p of pages) {
    const dur = p.durationMs ?? 0;
    totalDurationMs += dur;

    const existing = domainMap.get(p.domain);
    if (existing) {
      existing.count += 1;
      existing.durationMs += dur;
    } else {
      domainMap.set(p.domain, { count: 1, durationMs: dur });
    }
  }

  // topDomains：按 durationMs 降序，取前 10
  const topDomains: DomainStat[] = [...domainMap.entries()]
    .map(([domain, stat]) => ({ domain, ...stat }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  const digest: DailyDigest = {
    date: dateStr,
    summary: "", // 后续可由 LLM 填充
    pageCount: pages.length,
    totalDurationMs,
    topDomains,
  };

  // upsert
  await db.digests.put(digest);

  // 附带 pages 详情供后端存储（UploadDigestRequest 的 pages 字段）
  const pagesPayload = pages.map((p) => ({
    url: p.url,
    title: p.title,
    domain: p.domain,
    visitedAt: p.visitedAt,
    durationMs: p.durationMs ?? 0,
    summary: "",
    topics: [] as string[],
    favorited: false,
  }));

  return { ...digest, pages: pagesPayload };
}

/**
 * 获取昨天的日期字符串 YYYY-MM-DD（本地时区）
 */
export function getYesterdayDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
