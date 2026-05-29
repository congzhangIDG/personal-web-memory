// 每日聚合模块
// 将某日的 PageRecord[] 聚合为 DailyDigest 并写入本地 digests 表。

import { db } from "./db";
import { isBlacklisted } from "./patterns";
import { DEFAULT_BLACKLIST } from "./defaults";
import type { DailyDigest, DomainStat } from "@pwm/shared";
import type { LocalPageRecord } from "./db";

export interface BuildDigestResult {
  digest: DailyDigest;
  pageIds: number[];
}

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
): Promise<BuildDigestResult | null> {
  const { start, end } = dateRange(dateStr);

  let pages: LocalPageRecord[] = await db.pages
    .where("visitedAt")
    .between(start, end, true, false)
    .toArray();

  if (pages.length === 0) return null;

  const settings = await db.settings.get("singleton");
  const blacklist = settings?.blacklist ?? DEFAULT_BLACKLIST;
  if (blacklist.length > 0) {
    const filtered = pages.filter((p) => !isBlacklisted(p.url, blacklist));
    if (filtered.length === 0) return null;
    pages.length = 0;
    pages.push(...filtered);
  }

  const pageIds = pages.map((p) => p.id!).filter(Boolean);

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

  const topDomains: DomainStat[] = [...domainMap.entries()]
    .map(([domain, stat]) => ({ domain, ...stat }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  const digest: DailyDigest = {
    date: dateStr,
    summary: "",
    pageCount: pages.length,
    totalDurationMs,
    topDomains,
  };

  await db.digests.put(digest);

  const urlMap = new Map<string, {
    url: string;
    title: string;
    domain: string;
    visitedAt: number;
    durationMs: number;
    textContent?: string;
    hasNewContent: boolean;
  }>();

  for (const p of pages) {
    const isNew = p.uploaded !== 1;
    const existing = urlMap.get(p.url);
    if (existing) {
      existing.durationMs += p.durationMs ?? 0;
      if (isNew) existing.hasNewContent = true;
      if (p.visitedAt > existing.visitedAt) {
        existing.visitedAt = p.visitedAt;
        existing.title = p.title;
        if (p.textContent && isNew) existing.textContent = p.textContent;
      }
    } else {
      urlMap.set(p.url, {
        url: p.url,
        title: p.title,
        domain: p.domain,
        visitedAt: p.visitedAt,
        durationMs: p.durationMs ?? 0,
        textContent: isNew ? p.textContent : undefined,
        hasNewContent: isNew,
      });
    }
  }

  const pagesPayload = [...urlMap.values()].map(({ hasNewContent: _, ...p }) => ({
    ...p,
    summary: "",
    topics: [] as string[],
    favorited: false,
  }));

  return { digest: { ...digest, pages: pagesPayload }, pageIds };
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
