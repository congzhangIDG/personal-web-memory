import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, updateAppSettings, SETTING_META } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getAppSettings();

  // 按已定义顺序返回
  const items = SETTING_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    description: meta.description,
    value: settings[meta.key] ?? "",
  }));

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
