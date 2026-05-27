"use client";

import { useEffect, useState } from "react";

type SettingItem = {
  key: string;
  label: string;
  description: string;
  value: string;
};

export default function SettingsPage() {
  const [items, setItems] = useState<SettingItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // 加载设置
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setMessage("加载设置失败"));
  }, []);

  const handleChange = (key: string, value: string) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, value } : i)));
    setDirty(true);
    setMessage("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ key: i.key, value: i.value })),
        }),
      });
      if (res.ok) {
        setDirty(false);
        setMessage("✅ 已保存");
      } else {
        setMessage("❌ 保存失败");
      }
    } catch {
      setMessage("❌ 保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(106,125,255,0.22),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(86,211,154,0.12),_transparent_22%),linear-gradient(180deg,_#08101d_0%,_#0b1220_42%,_#111827_100%)] text-white">
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#08101d]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-2">
          <a href="/" className="text-sm text-white/50 hover:text-white transition-colors">
            ← 返回
          </a>
          <span className="text-sm font-medium text-white/70">系统设置</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        <p className="text-sm text-white/50">
          自定义 AI 摘要生成时的系统提示词。修改后下次生成时生效。
        </p>

        {items.map((item) => (
          <section key={item.key} className="rounded-2xl border border-white/10 bg-white/6 p-6 backdrop-blur-md space-y-3">
            <div>
              <h3 className="text-base font-semibold">{item.label}</h3>
              <p className="text-xs text-white/50 mt-1">{item.description}</p>
            </div>
            <textarea
              value={item.value}
              onChange={(e) => handleChange(item.key, e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
            />
          </section>
        ))}

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          {message && (
            <span className="text-sm text-white/70">{message}</span>
          )}
        </div>
      </main>
    </div>
  );
}
