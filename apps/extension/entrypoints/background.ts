import {
  startTracking,
  stopTracking,
  resumeTimer,
  pauseAll,
  isTracked,
} from "@/src/lib/tracker";
import { buildDailyDigest, getYesterdayDateStr } from "@/src/lib/aggregator";
import { uploadDigest } from "@/src/lib/uploader";

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
  const digest = await buildDailyDigest(dateStr);
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

  // --- tab URL 变化（导航完成）---
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
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

  // --- 每日聚合（alarms API）---
  const ALARM_NAME = "pwm-daily-aggregate";

  browser.alarms.create(ALARM_NAME, {
    // 每 24 小时触发一次；首次延迟 1 分钟
    delayInMinutes: 1,
    periodInMinutes: 1440,
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    const dateStr = getYesterdayDateStr();
    const result = await generateAndUploadDigest(dateStr);
    console.log("[PWM] Daily aggregation result", dateStr, result);
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== "pwm:generate-today-digest") {
      return undefined;
    }

    return (async () => {
      await syncCurrentActiveTab();
      return generateAndUploadDigest(getTodayDateStr());
    })();
  });
});
