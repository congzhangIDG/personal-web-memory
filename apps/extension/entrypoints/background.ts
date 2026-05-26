import {
  startTracking,
  stopTracking,
  resumeTimer,
  pauseTimer,
  pauseAll,
  isTracked,
} from "@/src/lib/tracker";

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
});
