import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/src/lib/db";
import { DEFAULT_BLACKLIST } from "@/src/lib/defaults";
import { buildDailyDigest } from "@/src/lib/aggregator";
import { uploadDigest } from "@/src/lib/uploader";
import type { PageRecord, Settings } from "@pwm/shared";

type Tab = "home" | "blacklist" | "prefs" | "about";

type LogEntry = {
  time: string;
  message: string;
  level: "info" | "success" | "error";
};

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "首页" },
  { id: "blacklist", label: "黑名单" },
  { id: "prefs", label: "偏好" },
  { id: "about", label: "关于" },
];

type FormState = Omit<Settings, "id">;

const defaultForm: FormState = {
  enabled: true,
  apiBaseUrl: "http://127.0.0.1:3000",
  lastUploadedDate: undefined,
  blacklist: DEFAULT_BLACKLIST,
  uploadIntervalMin: 5,
  minDurationSec: 5,
  recordIncognito: false,
};

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "-";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分${sec % 60}秒`;
  const hr = Math.floor(min / 60);
  return `${hr}时${min % 60}分`;
}

function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [form, setForm] = useState<FormState>(defaultForm);
  const [status, setStatus] = useState("正在读取设置...");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [newBlacklistItem, setNewBlacklistItem] = useState("");
  const [pendingPages, setPendingPages] = useState<PageRecord[]>([]);
  const [pendingExpanded, setPendingExpanded] = useState(false);

  const loadPendingPages = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const startOfDay = new Date(today).getTime();
    const endOfDay = startOfDay + 86400000;
    const pages = await db.pages
      .where("visitedAt")
      .between(startOfDay, endOfDay, true, false)
      .toArray();
    setPendingPages(pages);
  }, []);

  useEffect(() => {
    async function loadSettings() {
      const s = await db.settings.get("singleton");
      setForm({
        enabled: s?.enabled ?? defaultForm.enabled,
        apiBaseUrl: s?.apiBaseUrl ?? defaultForm.apiBaseUrl,
        lastUploadedDate: s?.lastUploadedDate,
        blacklist: s?.blacklist ?? defaultForm.blacklist,
        uploadIntervalMin: s?.uploadIntervalMin ?? defaultForm.uploadIntervalMin,
        minDurationSec: s?.minDurationSec ?? defaultForm.minDurationSec,
        recordIncognito: s?.recordIncognito ?? defaultForm.recordIncognito,
      });
      setStatus("设置已加载");
    }
    void loadSettings();
    void loadPendingPages();
  }, [loadPendingPages]);

  const statusTone = useMemo(() => {
    return form.enabled
      ? { dot: "#22c55e", text: "自动上传已开启" }
      : { dot: "#f59e0b", text: "自动上传已暂停" };
  }, [form.enabled]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [uploadLogs]);

  function appendLog(message: string, level: LogEntry["level"] = "info") {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setUploadLogs((prev) => [...prev, { time, message, level }]);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const prev = await db.settings.get("singleton");
      await db.settings.put({
        id: "singleton",
        enabled: form.enabled,
        apiBaseUrl: (form.apiBaseUrl || "").trim() || undefined,
        lastUploadedDate: prev?.lastUploadedDate,
        blacklist: form.blacklist,
        uploadIntervalMin: form.uploadIntervalMin,
        minDurationSec: form.minDurationSec,
        recordIncognito: form.recordIncognito,
      });
      await browser.runtime.sendMessage({ type: "pwm:settings-updated" });
      setStatus("配置已保存");
    } catch (error) {
      console.error("[PWM] Save settings failed", error);
      setStatus("保存失败，请稍后重试");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateTodayDigest() {
    setIsGenerating(true);
    setUploadLogs([]);
    const today = new Date().toISOString().slice(0, 10);

    try {
      // Step 1: flush tracker 内存数据到 Dexie
      appendLog("正在同步活跃标签页计时数据...");
      await browser.runtime.sendMessage({ type: "pwm:flush-trackers" });
      appendLog("活跃标签页数据已同步", "success");

      // Step 2: 本地聚合
      appendLog(`正在聚合 ${today} 的本地浏览记录...`);
      const result = await buildDailyDigest(today);
      if (!result) {
        appendLog("今日无可上传的浏览记录", "error");
        setStatus("今日无浏览记录");
        return;
      }
      const { digest, pageIds } = result;
      appendLog(
        `聚合完成：${digest.pages.length} 个页面，${digest.topDomains.length} 个域名`,
        "success",
      );

      // Step 3: 上传到服务器
      appendLog(`正在上传到 ${form.apiBaseUrl || "默认地址"}...`);
      const uploadResult = await uploadDigest(digest, pageIds);
      if (!uploadResult.ok) {
        appendLog(`上传失败: ${uploadResult.message}`, "error");
        setStatus(uploadResult.message ?? "上传失败");
        return;
      }
      appendLog(
        `上传成功！服务端已接收 ${uploadResult.pagesUpserted ?? digest.pages.length} 条记录`,
        "success",
      );

      // Step 4: 更新本地状态
      const nowISO = new Date().toISOString();
      await db.settings.update("singleton", { lastUploadedDate: nowISO });
      setForm((c) => ({ ...c, lastUploadedDate: nowISO }));
      setStatus("今日工作记忆已生成并上传");
      appendLog("本地上传时间已更新", "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appendLog(`错误: ${msg}`, "error");
      setStatus("生成失败，请检查扩展权限、API 地址和后台服务状态");
    } finally {
      setIsGenerating(false);
    }
  }

  function addBlacklistItem() {
    const item = newBlacklistItem.trim();
    if (!item) return;
    if (form.blacklist?.includes(item)) return;
    setForm((c) => ({ ...c, blacklist: [...(c.blacklist || []), item] }));
    setNewBlacklistItem("");
  }

  function removeBlacklistItem(index: number) {
    setForm((c) => ({
      ...c,
      blacklist: (c.blacklist || []).filter((_, i) => i !== index),
    }));
  }

  return (
    <div className="popupShell">
      <div className="popupCard">
        {/* Tab 导航 */}
        <nav className="tabNav">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tabBtn ${tab === t.id ? "tabActive" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* 首页 */}
        {tab === "home" && (
          <>
            <header className="heroBlock">
              <div className="brandRow">
                <span className="brandMark">🧠</span>
                <div>
                  <h1>Personal Web Memory</h1>
                  <p>记录、聚合、上传你的浏览记忆</p>
                </div>
              </div>
              <div className="statusRow">
                <span className="statusDot" style={{ backgroundColor: statusTone.dot }} />
                <div>
                  <div className="statusTitle">{statusTone.text}</div>
                  <div className="statusDesc">{status}</div>
                </div>
              </div>
            </header>

            <section className="sectionBlock">
              <div className="sectionTitle">快速操作</div>
              <div className="helperCard">
                <div className="helperTitle">立即生成今日工作记忆</div>
                <div className="helperText">
                  立刻聚合"今天"的本地浏览记录，并上传到当前 API 地址。
                </div>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => void handleGenerateTodayDigest()}
                  disabled={isGenerating}
                >
                  {isGenerating ? "生成中..." : "立即生成并上传"}
                </button>

                {uploadLogs.length > 0 && (
                  <div className="uploadLogBox">
                    {uploadLogs.map((log, i) => (
                      <div key={i} className={`logEntry logEntry--${log.level}`}>
                        <span className="logTime">{log.time}</span>
                        <span className="logMsg">{log.message}</span>
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
            </section>

            <section className="sectionBlock">
              <div className="sectionTitle">
                今日本地记录
                {pendingPages.length > 0 && (
                  <span className="countBadge">{pendingPages.length}</span>
                )}
              </div>
              <div className="helperCard">
                {pendingPages.length === 0 ? (
                  <div className="helperText">今日暂无浏览记录</div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="expandBtn"
                      onClick={() => setPendingExpanded((v) => !v)}
                    >
                      {pendingExpanded ? "收起列表 ▲" : `查看全部 ${pendingPages.length} 条 ▼`}
                    </button>
                    {pendingExpanded && (
                      <ul className="pendingList">
                        {pendingPages.map((p) => (
                          <li key={p.id ?? p.visitedAt} className="pendingItem">
                            {p.favicon && <img src={p.favicon} className="pendingFavicon" alt="" />}
                            <div className="pendingInfo">
                              <a
                                className="pendingTitle"
                                href={p.url}
                                target="_blank"
                                rel="noreferrer"
                                title={p.url}
                              >
                                {p.title || p.domain}
                              </a>
                              <span className="pendingMeta">
                                {p.domain} · {formatDuration(p.durationMs)}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </section>

            <section className="sectionBlock">
              <div className="sectionTitle">上传配置</div>
              <label className="fieldBlock">
                <div className="fieldTextGroup">
                  <span className="fieldTitle">启用自动上传</span>
                  <span className="fieldHint">关闭后，后台定时上传将被跳过</span>
                </div>
                <button
                  type="button"
                  className={`switchButton ${form.enabled ? "isOn" : ""}`}
                  onClick={() => setForm((c) => ({ ...c, enabled: !c.enabled }))}
                >
                  <span className="switchThumb" />
                </button>
              </label>

              <label className="fieldBlock fieldColumn">
                <div className="fieldTextGroup fieldTextGroupColumn">
                  <span className="fieldTitle">API 基地址</span>
                  <span className="fieldHint">后端服务地址</span>
                </div>
                <input
                  className="textInput"
                  type="url"
                  value={form.apiBaseUrl || ""}
                  onChange={(e) => setForm((c) => ({ ...c, apiBaseUrl: e.target.value }))}
                  placeholder="http://127.0.0.1:3000/"
                />
              </label>

              <div className="statsGrid">
                <div className="statCard">
                  <div className="statLabel">上传模式</div>
                  <div className="statValue">{form.enabled ? "自动" : "手动"}</div>
                </div>
                <div className="statCard">
                  <div className="statLabel">最近上传</div>
                  <div className="statValue">
                    {form.lastUploadedDate
                      ? new Date(form.lastUploadedDate).toLocaleString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })
                      : "-"}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* 黑名单 */}
        {tab === "blacklist" && (
          <section className="sectionBlock">
            <div className="sectionTitle">黑名单</div>
            <div className="helperCard">
              <div className="helperText">
                添加不需要记录的域名或 URL 通配符模式。例如：google.com、*://*/login*
              </div>
            </div>

            <div className="fieldBlock fieldColumn">
              <div className="blacklistInputRow">
                <input
                  className="textInput"
                  type="text"
                  value={newBlacklistItem}
                  onChange={(e) => setNewBlacklistItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addBlacklistItem()}
                  placeholder="输入域名或 URL 模式"
                />
                <button type="button" className="addBtn" onClick={addBlacklistItem}>
                  添加
                </button>
              </div>
            </div>

            <ul className="blacklistList">
              {(form.blacklist || []).map((item, i) => (
                <li key={i} className="blacklistItem">
                  <span className="blacklistText">{item}</span>
                  <button
                    type="button"
                    className="removeBtn"
                    onClick={() => removeBlacklistItem(i)}
                  >
                    ✕
                  </button>
                </li>
              ))}
              {(!form.blacklist || form.blacklist.length === 0) && (
                <li className="blacklistEmpty">暂无黑名单规则</li>
              )}
            </ul>
          </section>
        )}

        {/* 偏好设置 */}
        {tab === "prefs" && (
          <section className="sectionBlock">
            <div className="sectionTitle">偏好设置</div>

            <label className="fieldBlock fieldColumn">
              <div className="fieldTextGroup fieldTextGroupColumn">
                <span className="fieldTitle">上传频率（分钟）</span>
                <span className="fieldHint">有新数据时按此间隔上传</span>
              </div>
              <input
                className="textInput"
                type="number"
                min={1}
                value={form.uploadIntervalMin ?? 5}
                onChange={(e) =>
                  setForm((c) => ({ ...c, uploadIntervalMin: Number(e.target.value) || 1 }))
                }
              />
            </label>

            <label className="fieldBlock fieldColumn">
              <div className="fieldTextGroup fieldTextGroupColumn">
                <span className="fieldTitle">最小记录时长（秒）</span>
                <span className="fieldHint">停留低于此值的页面不记录</span>
              </div>
              <input
                className="textInput"
                type="number"
                min={0}
                value={form.minDurationSec ?? 5}
                onChange={(e) =>
                  setForm((c) => ({ ...c, minDurationSec: Number(e.target.value) }))
                }
              />
            </label>

            <label className="fieldBlock">
              <div className="fieldTextGroup">
                <span className="fieldTitle">记录隐身标签页</span>
                <span className="fieldHint">开启后，隐身模式下的浏览也会被记录</span>
              </div>
              <button
                type="button"
                className={`switchButton ${form.recordIncognito ? "isOn" : ""}`}
                onClick={() => setForm((c) => ({ ...c, recordIncognito: !c.recordIncognito }))}
              >
                <span className="switchThumb" />
              </button>
            </label>
          </section>
        )}

        {/* 关于 */}
        {tab === "about" && (
          <section className="sectionBlock">
            <div className="sectionTitle">关于</div>
            <div className="aboutContent">
              <div className="aboutRow">
                <span className="fieldTitle">版本</span>
                <span className="fieldHint">1.0.0</span>
              </div>
              <div className="aboutRow">
                <span className="fieldTitle">项目</span>
                <a
                  className="aboutLink"
                  href="https://github.com/user/personal-web-memory"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
              </div>
              <div className="aboutDesc">
                Personal Web Memory 是一个浏览记忆系统，通过扩展采集浏览行为，按日聚合为
                Daily Digest，由 Dashboard 展示并生成 AI 摘要。
              </div>
            </div>
          </section>
        )}

        {/* 全局保存按钮 */}
        <footer className="footerBlock">
          <button
            type="button"
            className="primaryButton"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            {isSaving ? "保存中..." : "保存配置"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default App;
