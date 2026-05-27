import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, updateAppSettings, SETTING_META, SETTING_KEYS } from "@/lib/settings";
import { DEFAULT_DOMAIN_TAG_MAP, DEFAULT_TECH_KEYWORDS } from "@/lib/topics";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getAppSettings();

  // 按已定义顺序返回
  const items = SETTING_META.map((meta) => {
    let defaultValue: string | undefined;
    if (meta.key === SETTING_KEYS.domainTagMap) {
      defaultValue = JSON.stringify(DEFAULT_DOMAIN_TAG_MAP, null, 2);
    } else if (meta.key === SETTING_KEYS.techKeywords) {
      defaultValue = JSON.stringify(DEFAULT_TECH_KEYWORDS, null, 2);
    }

    return {
      key: meta.key,
      label: meta.label,
      description: meta.description,
      value: settings[meta.key] ?? "",
      defaultValue,
    };
  });

  return NextResponse.json({ items });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as { items?: Array<{ key: string; value: string }> };
  if (!body.items || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  for (const item of body.items) {
    if (typeof item.key === "string" && typeof item.value === "string") {
      updates[item.key] = item.value;
    }
  }

  await updateAppSettings(updates);
  return NextResponse.json({ ok: true });
}
