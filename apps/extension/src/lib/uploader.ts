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

/**
 * 上传一份 DailyDigest 到后端，成功后更新 lastUploadedDate。
 * @returns true 表示上传成功
 */
export async function uploadDigest(digest: DailyDigest): Promise<boolean> {
  const settings = await getSettings();
  if (settings?.enabled === false) {
    console.log("[PWM] Upload skipped because auto upload is disabled");
    return false;
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
      console.error("[PWM] Upload failed", res.status, await res.text());
      return false;
    }

    const data = (await res.json()) as UploadDigestResponse;
    if (data.ok) {
      await db.settings.update("singleton", {
        lastUploadedDate: digest.date,
      });
      return true;
    }
    return false;
  } catch (err) {
    console.error("[PWM] Upload error", err);
    return false;
  }
}
