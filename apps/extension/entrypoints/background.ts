import {
  startTracking,
  stopTracking,
  resumeTimer,
  pauseAll,
  flushAll,
  isTracked,
  updateTitle,
  getActiveRecordIds,
} from "@/src/lib/tracker";
import { buildDailyDigest, getYesterdayDateStr } from "@/src/lib/aggregator";
import { uploadDigest } from "@/src/lib/uploader";
import { db } from "@/src/lib/db";

function getTodayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function syncCurrentActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;

  pauseAll();
  if (isTracked(tab.id)) {
    resumeTimer(tab.id);
    return;
  }

  await startTracking(tab.id, tab.url, tab.title ?? "", true);
}

async function generateAndUploadDigest(dateStr: string) {
  await flushAll();
  const excludeIds = getActiveRecordIds();
  const digest = await buildDailyDigest(dateStr, excludeIds);
  if (!digest) {
    return {
      ok: false,
      reason: "no_data",
      message: "当天还没有可聚合的浏览记录",
    };
  }

  const uploaded = await uploadDigest(digest);
  if (!uploaded) {
    return {
      ok: false,
      reason: "upload_failed",
      message: "摘要已生成，但上传失败，请检查 API 地址与服务状态",
      date: digest.date,
    };
  }

  return {
    ok: true,
    reason: "uploaded",
    message: "工作记忆已生成并上传成功",
    date: digest.date,
  };
}

export default defineBackground(() => {
  // --- 点击扩展图标打开设置 Tab（代替 popup）---
  browser.action.onClicked.addListener(() => {
    browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
  });

  // --- tab 激活（切换 tab）---
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

  // --- tab URL 变化 / 页面加载完成 ---
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      // URL 变化：创建新记录
      if (!tab.url) return;
      const isActive = tab.active;
      await startTracking(tabId, tab.url, tab.title ?? "", isActive);
      return;
    }

    // 页面完全加载后更新标题（解决 SPA / 微信文章等标题延迟设置的问题）
    if (changeInfo.status === "complete" && tab.title && isTracked(tabId)) {
      await updateTitle(tabId, tab.title);
    }
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

  void syncCurrentActiveTab();

  // --- 定时上传（alarms API，按用户配置间隔）---
  const ALARM_NAME = "pwm-periodic-upload";
  const DEFAULT_INTERVAL_MIN = 5;

  async function setupAlarm() {
    const settings = await db.settings.get("singleton");
    const intervalMin = settings?.uploadIntervalMin ?? DEFAULT_INTERVAL_MIN;
    // 先清除旧 alarm，再按最新配置重建
    await browser.alarms.clear(ALARM_NAME);
    browser.alarms.create(ALARM_NAME, {
      delayInMinutes: intervalMin,
      periodInMinutes: intervalMin,
    });
    console.log(`[PWM] Alarm set: every ${intervalMin} min`);
  }

  void setupAlarm();

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;

    // 检查是否启用自动上传
    const settings = await db.settings.get("singleton");
    if (settings?.enabled === false) {
      console.log("[PWM] Auto upload skipped (disabled)");
      return;
    }

    // 上传今天的数据
    const dateStr = getTodayDateStr();
    const result = await generateAndUploadDigest(dateStr);
    console.log("[PWM] Periodic upload result", dateStr, result);
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "pwm:generate-today-digest") {
      return (async () => {
        try {
          await syncCurrentActiveTab();
          const result = await generateAndUploadDigest(getTodayDateStr());
          return { ok: true, result };
        } catch (e) {
          console.error("[PWM] Generate today digest failed", e);
          return { ok: false, error: String(e) };
        }
      })();
    }

    if (message?.type === "pwm:settings-updated") {
      void setupAlarm();
      return Promise.resolve({ ok: true });
    }

    return undefined;
  });
});
