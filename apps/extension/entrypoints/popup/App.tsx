import { useEffect, useMemo, useState } from "react";
import { db } from "@/src/lib/db";
import type { Settings } from "@pwm/shared";

type Tab = "home" | "llm" | "blacklist" | "prefs" | "about";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "首页" },
  { id: "llm", label: "LLM" },
  { id: "blacklist", label: "黑名单" },
  { id: "prefs", label: "偏好" },
  { id: "about", label: "关于" },
];

type FormState = Omit<Settings, "id">;

const DEFAULT_BLACKLIST = ["localhost", "127.0.0.1", "*127.0.0.1*", "192.168.106.16"];

const defaultForm: FormState = {
  enabled: true,
  apiBaseUrl: "http://127.0.0.1:3000",
  lastUploadedDate: undefined,
  llmBaseUrl: "https://openrouter.idgcapital.com/v1",
  llmModel: "large",
  llmApiKey: "EMPTY",
  blacklist: DEFAULT_BLACKLIST,
  uploadIntervalMin: 5,
  minDurationSec: 5,
  recordIncognito: false,
};

function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [form, setForm] = useState<FormState>(defaultForm);
  const [status, setStatus] = useState("正在读取设置...");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newBlacklistItem, setNewBlacklistItem] = useState("");

  useEffect(() => {
    async function loadSettings() {
      const s = await db.settings.get("singleton");
      setForm({
        enabled: s?.enabled ?? defaultForm.enabled,
        apiBaseUrl: s?.apiBaseUrl ?? defaultForm.apiBaseUrl,
        lastUploadedDate: s?.lastUploadedDate,
        llmBaseUrl: s?.llmBaseUrl ?? defaultForm.llmBaseUrl,
        llmModel: s?.llmModel ?? defaultForm.llmModel,
        llmApiKey: s?.llmApiKey ?? defaultForm.llmApiKey,
        blacklist: s?.blacklist ?? defaultForm.blacklist,
        uploadIntervalMin: s?.uploadIntervalMin ?? defaultForm.uploadIntervalMin,
        minDurationSec: s?.minDurationSec ?? defaultForm.minDurationSec,
        recordIncognito: s?.recordIncognito ?? defaultForm.recordIncognito,
      });
      setStatus("设置已加载");
    }
    void loadSettings();
  }, []);

  const statusTone = useMemo(() => {
    return form.enabled
      ? { dot: "#22c55e", text: "自动上传已开启" }
      : { dot: "#f59e0b", text: "自动上传已暂停" };
  }, [form.enabled]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const prev = await db.settings.get("singleton");
      await db.settings.put({
        id: "singleton",
        enabled: form.enabled,
        apiBaseUrl: (form.apiBaseUrl || "").trim() || undefined,
        lastUploadedDate: prev?.lastUploadedDate,
        llmBaseUrl: (form.llmBaseUrl || "").trim() || undefined,
        llmModel: (form.llmModel || "").trim() || undefined,
        llmApiKey: (form.llmApiKey || "").trim() || undefined,
        blacklist: form.blacklist,
        uploadIntervalMin: form.uploadIntervalMin,
        minDurationSec: form.minDurationSec,
        recordIncognito: form.recordIncognito,
      });
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
    setStatus("正在生成今日工作记忆...");
    try {
      const result = await browser.runtime.sendMessage({
        type: "pwm:generate-today-digest",
      });
      if (!result?.ok) {
        setStatus(result?.message ?? "生成失败，请稍后重试");
        return;
      }
      setForm((c) => ({ ...c, lastUploadedDate: result.date }));
      setStatus(result.message ?? "今日工作记忆已生成并上传");
    } catch (error) {
      console.error("[PWM] Generate today digest failed", error);
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
                  <div className="statValue">{form.lastUploadedDate ?? "-"}</div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* LLM 配置 */}
        {tab === "llm" && (
          <section className="sectionBlock">
            <div className="sectionTitle">LLM 配置</div>
            <div className="helperCard">
              <div className="helperText">
                扩展端 LLM 配置会随上传传给后端，覆盖后端 .env 中的默认值。留空则使用后端默认配置。
              </div>
            </div>

            <label className="fieldBlock fieldColumn">
              <div className="fieldTextGroup fieldTextGroupColumn">
                <span className="fieldTitle">API Base URL</span>
              </div>
              <input
                className="textInput"
                type="url"
                value={form.llmBaseUrl || ""}
                onChange={(e) => setForm((c) => ({ ...c, llmBaseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
            </label>

            <label className="fieldBlock fieldColumn">
              <div className="fieldTextGroup fieldTextGroupColumn">
                <span className="fieldTitle">Model ID</span>
              </div>
              <input
                className="textInput"
                type="text"
                value={form.llmModel || ""}
                onChange={(e) => setForm((c) => ({ ...c, llmModel: e.target.value }))}
                placeholder="gpt-4o-mini"
              />
            </label>

            <label className="fieldBlock fieldColumn">
              <div className="fieldTextGroup fieldTextGroupColumn">
                <span className="fieldTitle">API Key</span>
              </div>
              <input
                className="textInput"
                type="password"
                value={form.llmApiKey || ""}
                onChange={(e) => setForm((c) => ({ ...c, llmApiKey: e.target.value }))}
                placeholder="sk-..."
              />
            </label>
          </section>
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
