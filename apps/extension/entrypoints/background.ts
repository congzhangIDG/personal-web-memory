import {
  startTracking,
  stopTracking,
  resumeTimer,
  pauseTimer,
  pauseAll,
  isTracked,
} from "@/src/lib/tracker";
import { buildDailyDigest, getYesterdayDateStr } from "@/src/lib/aggregator";
import { uploadDigest } from "@/src/lib/uploader";

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
    const digest = await buildDailyDigest(dateStr);
    if (!digest) {
      console.log("[PWM] Daily aggregation", dateStr, "no data");
      return;
    }
    console.log("[PWM] Daily aggregation", dateStr, "done, uploading...");
    const ok = await uploadDigest(digest);
    console.log("[PWM] Upload", dateStr, ok ? "success" : "failed");
  });
});
