# Step 3: 扩展端采集与活跃计时 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 background service worker 中监听 tab 生命周期事件，将每次页面访问写入 Dexie `pages` 表，并以 visibility 信号控制活跃时长计算。

**Architecture:** background.ts 维护一个内存 Map（tabId → 当前活跃记录 ID + 计时元数据）。tab 激活/URL 变化时创建 PageRecord 并开始计时；tab 失活/关闭/URL 变化时停止计时并回填 durationMs。不使用 alarms，纯事件驱动。

**Tech Stack:** WXT (defineBackground)、browser.tabs/browser.webNavigation API、Dexie (db.pages)、@pwm/shared (PageRecord type)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/extension/src/lib/tracker.ts` | 核心追踪逻辑：内存状态 Map、开始/结束记录函数 |
| `apps/extension/entrypoints/background.ts` | 注册 browser 事件监听，调用 tracker |
| `apps/extension/src/lib/db.ts` | 已有，无需修改 |

---

## Task 1: 创建 tracker 模块（核心状态与工具函数）

**Files:**
- Create: `apps/extension/src/lib/tracker.ts`

- [ ] **Step 1: 创建 tracker.ts 基础结构**

```ts
// apps/extension/src/lib/tracker.ts
import { db } from "./db";
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
```

- [ ] **Step 2: 验证类型编译通过**

Run: `pnpm -F @pwm/extension compile`
Expected: exit 0，无错误

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/lib/tracker.ts
git commit -m "feat(extension): add tab tracker module with start/stop/pause logic"
```

---

## Task 2: 连接 background.ts 事件监听

**Files:**
- Modify: `apps/extension/entrypoints/background.ts`

- [ ] **Step 1: 重写 background.ts 注册事件**

```ts
// apps/extension/entrypoints/background.ts
import {
  startTracking,
  stopTracking,
  resumeTimer,
  pauseTimer,
  pauseAll,
} from "@/lib/tracker";

export default defineBackground(() => {
  // --- tab 激活（切换 tab）---
  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    // 暂停之前活跃的 tab
    // 注：onActivated 不告诉我们"之前"是哪个 tab，所以 pauseAll 再 resume 当前
    pauseAll();

    const tab = await browser.tabs.get(tabId);
    if (!tab.url) return;

    // 如果该 tab 已在追踪中（只是切回来），恢复计时
    resumeTimer(tabId);

    // 如果是尚未追踪的 tab（例如扩展刚启动时已打开的 tab），开始追踪
    // startTracking 内部会检查是否已有记录，如果有则不重复创建
    // 这里用一个简单策略：如果 tracker 里没有这个 tabId，说明是新的
  });

  // --- tab URL 变化（导航完成）---
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // 只关心 URL 变化（导航完成）
    if (!changeInfo.url) return;
    if (!tab.url) return;

    const isActive = tab.active;
    await startTracking(tabId, tab.url, tab.title ?? "", isActive);
  });

  // --- tab 关闭 ---
  browser.tabs.onRemoved.addListener(async (tabId) => {
    await stopTracking(tabId);
  });

  // --- 窗口焦点变化（浏览器失焦时暂停所有计时）---
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
      pauseAll();
    } else {
      // 窗口恢复焦点，恢复当前活跃 tab 的计时
      browser.tabs.query({ active: true, windowId }).then((tabs) => {
        if (tabs[0]?.id != null) {
          resumeTimer(tabs[0].id);
        }
      });
    }
  });

  console.log("[PWM] Background tracker initialized", {
    id: browser.runtime.id,
  });
});
```

- [ ] **Step 2: 验证类型编译通过**

Run: `pnpm -F @pwm/extension compile`
Expected: exit 0，无错误

- [ ] **Step 3: Commit**

```bash
git add apps/extension/entrypoints/background.ts
git commit -m "feat(extension): wire tab events to tracker in background service worker"
```

---

## Task 3: 修复 onActivated 对"新 tab 首次追踪"的处理

**Files:**
- Modify: `apps/extension/entrypoints/background.ts`
- Modify: `apps/extension/src/lib/tracker.ts`

- [ ] **Step 1: 在 tracker.ts 中导出 isTracked 辅助函数**

在 `tracker.ts` 末尾追加：

```ts
/** 检查某 tab 是否已在追踪中 */
export function isTracked(tabId: number): boolean {
  return tracked.has(tabId);
}
```

- [ ] **Step 2: 在 background.ts 的 onActivated 中补充首次追踪逻辑**

将 `onActivated` 监听替换为：

```ts
  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    pauseAll();

    const tab = await browser.tabs.get(tabId);
    if (!tab.url) return;

    if (isTracked(tabId)) {
      resumeTimer(tabId);
    } else {
      await startTracking(tabId, tab.url, tab.title ?? "", true);
    }
  });
```

在文件顶部 import 中加入 `isTracked`：

```ts
import {
  startTracking,
  stopTracking,
  resumeTimer,
  pauseTimer,
  pauseAll,
  isTracked,
} from "@/lib/tracker";
```

- [ ] **Step 3: 验证类型编译通过**

Run: `pnpm -F @pwm/extension compile`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/lib/tracker.ts apps/extension/entrypoints/background.ts
git commit -m "feat(extension): handle first-time tab tracking on activation"
```

---

## Task 4: 手动集成测试（dev 模式加载扩展）

- [ ] **Step 1: 启动 dev 模式**

Run: `pnpm -F @pwm/extension dev`
Expected: WXT 编译成功，输出 chrome-mv3-dev 目录

- [ ] **Step 2: 在 Chrome 中加载扩展并验证**

手动步骤（记录预期行为）：
1. 打开 `chrome://extensions`，开启开发者模式，加载 `apps/extension/.output/chrome-mv3-dev`
2. 打开 DevTools → background service worker console
3. 预期看到 `[PWM] Background tracker initialized`
4. 浏览几个网站，切换 tab
5. 在 background console 中执行：
   ```js
   const { db } = await import('./chunks/...')  // 或通过 Application → IndexedDB → pwm → pages 查看
   ```
6. 确认 `pages` 表中有记录，`durationMs` 在 tab 关闭后被回填

- [ ] **Step 3: 确认无运行时错误后 Commit（如有修复）**

```bash
git add -A
git commit -m "fix(extension): runtime fixes from integration test" --allow-empty
```

---

## 验证清单

| 条件 | 通过标准 |
|------|----------|
| `pnpm -F @pwm/extension compile` | exit 0 |
| background 启动 | console 输出 init 日志 |
| 打开新 tab（https 网站） | pages 表新增一行，visitedAt 为当前时间 |
| 切换到其他 tab | 旧 tab 的 durationMs 累积（pauseTimer） |
| 关闭 tab | durationMs 回填最终值 |
| 浏览器失焦 | 所有 tab 暂停计时 |
| 浏览器恢复焦点 | 当前活跃 tab 恢复计时 |
| chrome:// / about: 页面 | 不写入 pages 表 |
