// 将 DailyDigest 上传到后端 API
import { db } from "./db";
import type { DailyDigest, UploadDigestResponse } from "@pwm/shared";

const DEFAULT_API_BASE = "http://localhost:3000";

async function getApiBase(): Promise<string> {
  const settings = await db.settings.get("singleton");
  const raw = settings?.apiBaseUrl ?? DEFAULT_API_BASE;
  return raw.replace(/\/+$/, "");
}

async function getSettings() {
  return db.settings.get("singleton");
}

export interface UploadResult {
  ok: boolean;
  message?: string;
  pagesUpserted?: number;
}

/**
 * 上传一份 DailyDigest 到后端，成功后更新 lastUploadedDate。
 */
export async function uploadDigest(digest: DailyDigest): Promise<UploadResult> {
  const settings = await getSettings();
  if (settings?.enabled === false) {
    console.log("[PWM] Upload skipped because auto upload is disabled");
    return { ok: false, message: "自动上传已关闭" };
  }

  const base = await getApiBase();
  const url = `${base}/api/digest`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(digest),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[PWM] Upload failed", res.status, text);
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = (await res.json()) as UploadDigestResponse;
    if (data.ok) {
      await db.settings.update("singleton", {
        lastUploadedDate: new Date().toISOString(),
      });
      return { ok: true, pagesUpserted: data.pagesUpserted };
    }
    return { ok: false, message: data.message ?? "服务端返回失败" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PWM] Upload error", err);
    return { ok: false, message: msg };
  }
}
