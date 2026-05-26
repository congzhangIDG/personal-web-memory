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

  useEffect(() => {
    async function loadSettings() {
      const settings = await db.settings.get("singleton");

      setForm({
        enabled: settings?.enabled ?? true,
        apiBaseUrl: settings?.apiBaseUrl ?? "http://localhost:3000",
        lastUploadedDate: settings?.lastUploadedDate ?? "-",
      });
      setStatus("设置已加载");
    }

    void loadSettings();
  }, []);

  const statusTone = useMemo(() => {
    return form.enabled
      ? { dot: "#22c55e", text: "正在记录中" }
      : { dot: "#f59e0b", text: "已暂停上传" };
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
      setStatus("设置已保存");
    } catch (error) {
      console.error("[PWM] Save settings failed", error);
      setStatus("保存失败，请稍后重试");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="popupShell">
      <div className="popupCard">
        <header className="heroBlock">
          <div>
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
          </div>
        </header>

        <section className="sectionBlock">
          <div className="sectionTitle">上传设置</div>

          <label className="fieldBlock">
            <span>启用自动上传</span>
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
            <span>API 基地址</span>
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
              <div className="statLabel">上传模式</div>
              <div className="statValue">{form.enabled ? "自动" : "关闭"}</div>
            </div>
            <div className="statCard">
              <div className="statLabel">上次上传</div>
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
            {isSaving ? "保存中..." : "保存设置"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default App;
