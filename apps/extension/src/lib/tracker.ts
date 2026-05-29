// 扩展端 tab 追踪核心模块
// 维护 tabId → 活跃记录的内存 Map，事件驱动计时。

import { db } from "./db";
import { isBlacklisted } from "./patterns";
import { DEFAULT_BLACKLIST } from "./defaults";
import type { PageRecord } from "@pwm/shared";

/** 内存中正在追踪的 tab 状态 */
interface TrackedTab {
  /** Dexie 中对应 PageRecord 的自增 id */
  recordId: number;
  /** 活跃计时起点（Date.now()），null 表示当前非活跃 */
  activeStart: number | null;
  /** 已累积的活跃时长（ms） */
  accumulatedMs: number;
}

/** tabId → 追踪状态 */
const tracked = new Map<number, TrackedTab>();

/**
 * 从 URL 提取 domain；无效 URL 返回空字符串
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * 判断 URL 是否应该被追踪（排除 chrome://、about:、扩展页面等）
 */
function isTrackableUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/**
 * 开始追踪一个 tab 的新页面访问。
 * 若该 tab 已有追踪中的记录，先结算旧记录。
 */
export async function startTracking(
  tabId: number,
  url: string,
  title: string,
  isActive: boolean,
): Promise<void> {
  // 先结算旧记录
  await stopTracking(tabId);

  if (!isTrackableUrl(url)) return;

  const domain = extractDomain(url);
  if (!domain) return;

  const settings = await db.settings.get("singleton");
  const blacklist = settings?.blacklist ?? DEFAULT_BLACKLIST;
  if (blacklist.length > 0 && isBlacklisted(url, blacklist)) return;

  const record: Omit<PageRecord, "id"> = {
    url,
    title,
    domain,
    visitedAt: Date.now(),
    durationMs: undefined,
  };

  const recordId = await db.pages.add(record as PageRecord);

  tracked.set(tabId, {
    recordId,
    activeStart: isActive ? Date.now() : null,
    accumulatedMs: 0,
  });
}

/**
 * 结算并停止追踪一个 tab。回填 durationMs 到 Dexie。
 */
export async function stopTracking(tabId: number): Promise<void> {
  const state = tracked.get(tabId);
  if (!state) return;

  let totalMs = state.accumulatedMs;
  if (state.activeStart !== null) {
    totalMs += Date.now() - state.activeStart;
  }

  await db.pages.update(state.recordId, { durationMs: totalMs });
  tracked.delete(tabId);
}

/**
 * tab 变为活跃（激活），开始计时
 */
export function resumeTimer(tabId: number): void {
  const state = tracked.get(tabId);
  if (!state || state.activeStart !== null) return;
  state.activeStart = Date.now();
}

/**
 * tab 变为非活跃（切走），暂停计时
 */
export function pauseTimer(tabId: number): void {
  const state = tracked.get(tabId);
  if (!state || state.activeStart === null) return;
  state.accumulatedMs += Date.now() - state.activeStart;
  state.activeStart = null;
}

/**
 * 暂停所有 tab 的计时（窗口失焦时调用）
 */
export function pauseAll(): void {
  for (const [tabId] of tracked) {
    pauseTimer(tabId);
  }
}

/**
 * 将所有正在追踪的 tab 的当前累积时长写入 Dexie，但不终止追踪。
 * 用于聚合前确保 durationMs 已持久化。
 */
export async function flushAll(): Promise<void> {
  for (const [, state] of tracked) {
    let totalMs = state.accumulatedMs;
    if (state.activeStart !== null) {
      const now = Date.now();
      totalMs += now - state.activeStart;
      // 重置起点，避免下次重复计算
      state.activeStart = now;
    }
    state.accumulatedMs = totalMs;
    await db.pages.update(state.recordId, { durationMs: totalMs });
  }
}

/**
 * 清理 Dexie 中所有匹配当前黑名单的 PageRecord。
 * 黑名单变更后调用，清除已产生的脏数据。
 */
export async function cleanupBlacklistedPages(): Promise<number> {
  const settings = await db.settings.get("singleton");
  const blacklist = settings?.blacklist ?? DEFAULT_BLACKLIST;
  if (blacklist.length === 0) return 0;

  const all = await db.pages.toArray();
  const toDelete = all.filter((p) => isBlacklisted(p.url, blacklist));
  const ids = toDelete.map((p) => p.id!).filter(Boolean);

  if (ids.length > 0) {
    await db.pages.where("id").anyOf(ids).delete();
  }

  return ids.length;
}

/** 检查某 tab 是否已在追踪中 */
export function isTracked(tabId: number): boolean {
  return tracked.has(tabId);
}

/** 返回当前所有活跃追踪中的 Dexie recordId 列表 */
export function getActiveRecordIds(): number[] {
  return Array.from(tracked.values()).map((s) => s.recordId);
}

/**
 * 更新当前追踪 tab 的页面标题（页面完全加载后标题可能变化）
 */
export async function updateTitle(tabId: number, newTitle: string): Promise<void> {
  const state = tracked.get(tabId);
  if (!state || !newTitle) return;
  await db.pages.update(state.recordId, { title: newTitle });
}

/**
 * 保存 content script 提取的页面文本内容到 Dexie
 * 供 background.ts 的 pwm:page-content 消息处理用
 */
export async function updateTextContent(tabId: number, textContent: string): Promise<void> {
  const state = tracked.get(tabId);
  if (!state) return;
  await db.pages.update(state.recordId, { textContent });
}
