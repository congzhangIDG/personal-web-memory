import { useEffect, useMemo, useState } from "react";
import { db } from "@/src/lib/db";

type FormState = {
  enabled: boolean;
  apiBaseUrl: string;
  lastUploadedDate: string;
};

const defaultState: FormState = {
  enabled: true,
  apiBaseUrl: "http://localhost:3000",
  lastUploadedDate: "-",
};

function App() {
  const [form, setForm] = useState<FormState>(defaultState);
  const [status, setStatus] = useState("正在读取设置...");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const settings = await db.settings.get("singleton");

      setForm({
        enabled: settings?.enabled ?? true,
        apiBaseUrl: settings?.apiBaseUrl ?? "http://localhost:3000",
        lastUploadedDate: settings?.lastUploadedDate ?? "-",
      });
      setStatus("设置已加载，可手动生成或等待自动上传");
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
        apiBaseUrl: form.apiBaseUrl.trim(),
        lastUploadedDate:
          prev?.lastUploadedDate && prev.lastUploadedDate !== "-"
            ? prev.lastUploadedDate
            : undefined,
      });
      setStatus("配置已保存，后续上传将使用新的设置");
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

      setForm((current) => ({
        ...current,
        lastUploadedDate: result.date ?? getTodayDateStr(),
      }));
      setStatus(result.message ?? "今日工作记忆已生成并上传");
    } catch (error) {
      console.error("[PWM] Generate today digest failed", error);
      setStatus("生成失败，请检查扩展权限、API 地址和后台服务状态");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="popupShell">
      <div className="popupCard">
        <header className="heroBlock">
          <div className="brandRow">
            <span className="brandMark">🧠</span>
            <div>
              <h1>Personal Web Memory</h1>
              <p>记录、聚合、上传你的浏览记忆</p>
            </div>
          </div>

          <div className="statusRow">
            <span
              className="statusDot"
              style={{ backgroundColor: statusTone.dot }}
            />
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
              立刻聚合“今天”的本地浏览记录，并上传到当前 API 地址。
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
              onClick={() =>
                setForm((current) => ({ ...current, enabled: !current.enabled }))
              }
            >
              <span className="switchThumb" />
            </button>
          </label>

          <label className="fieldBlock fieldColumn">
            <div className="fieldTextGroup fieldTextGroupColumn">
              <span className="fieldTitle">API 基地址</span>
              <span className="fieldHint">
                支持 http://localhost:3000、http://127.0.0.1:3000 或 http://192.168.x.x:3000
              </span>
            </div>
            <input
              className="textInput"
              type="url"
              value={form.apiBaseUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  apiBaseUrl: event.target.value,
                }))
              }
              placeholder="http://localhost:3000"
            />
          </label>

          <div className="statsGrid">
            <div className="statCard">
              <div className="statLabel">当前上传模式</div>
              <div className="statValue">{form.enabled ? "自动上传" : "仅手动上传"}</div>
            </div>
            <div className="statCard">
              <div className="statLabel">最近成功上传日期</div>
              <div className="statValue">{form.lastUploadedDate}</div>
            </div>
          </div>
        </section>

        <footer className="footerBlock">
          <button
            type="button"
            className="primaryButton"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            {isSaving ? "保存中..." : "保存当前配置"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default App;
