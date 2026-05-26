"use client";

import { useState } from "react";
import type { DomainStat } from "@pwm/shared";

type DigestItem = {
  id: number;
  date: string;
  summary: string;
  pageCount: number;
  totalDurationMs: number;
  topDomains: DomainStat[];
  topics: string[];
  favorited: boolean;
};

type PageItem = {
  id: number;
  url: string;
  title: string;
  domain: string;
  visitedAt: number;
  durationMs: number;
  summary: string;
  topics: string[];
  favorited: boolean;
  date: string;
};

type Props = {
  digests: DigestItem[];
  pages: PageItem[];
  favorites: PageItem[];
};

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}秒`;
  return `${m}分${s}秒`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: string): string {
  const value = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(value);
}

function renderMarkdownLinks(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      return (
        <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">
          {match[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function PageCard({ page, onToggleFavorite }: { page: PageItem; onToggleFavorite: (id: number) => void }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{formatTime(page.visitedAt)}</span>
            <span>·</span>
            <span>停留 {formatDuration(page.durationMs)}</span>
            <span>·</span>
            <span className="truncate">{page.domain}</span>
          </div>
          <h4 className="text-base font-medium text-slate-900">
            <a href={page.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline">
              {page.title || page.url}
            </a>
          </h4>
          {page.summary && (
            <p className="text-sm leading-6 text-slate-600">{page.summary}</p>
          )}
          {page.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {page.topics.slice(0, 5).map((tag) => (
                <span key={tag} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => onToggleFavorite(page.id)}
          className="shrink-0 p-1 text-xl"
          title={page.favorited ? "取消收藏" : "收藏"}
        >
          {page.favorited ? "⭐" : "☆"}
        </button>
      </div>
    </article>
  );
}

export default function Dashboard({ digests, pages, favorites }: Props) {
  const [tab, setTab] = useState<"digest" | "favorites">("digest");
  const [pageList, setPageList] = useState(pages);
  const [favList, setFavList] = useState(favorites);

  const toggleFavorite = async (id: number) => {
    const res = await fetch(`/api/pages/${id}/favorite`, { method: "PATCH" });
    if (!res.ok) return;
    const { favorited } = await res.json();

    setPageList((prev) => prev.map((p) => (p.id === id ? { ...p, favorited } : p)));
    if (favorited) {
      const page = pageList.find((p) => p.id === id);
      if (page) setFavList((prev) => [{ ...page, favorited: true }, ...prev]);
    } else {
      setFavList((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const todayDigest = digests[0] ?? null;
  const todayPages = pageList.filter((p) => p.date === todayDigest?.date);

  const topicCounts: Record<string, number> = {};
  todayPages.forEach((p) => p.topics.forEach((t) => { topicCounts[t] = (topicCounts[t] || 0) + 1; }));
  const top5Topics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const groupedByDate: Record<string, PageItem[]> = {};
  pageList.forEach((p) => {
    if (!groupedByDate[p.date]) groupedByDate[p.date] = [];
    groupedByDate[p.date].push(p);
  });

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,_rgba(106,125,255,0.22),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(86,211,154,0.12),_transparent_22%),linear-gradient(180deg,_#08101d_0%,_#0b1220_42%,_#111827_100%)] text-white">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 lg:px-10">
        {/* Header */}
        <section className="space-y-4">
          <div className="inline-flex items-center rounded-full border border-white/12 bg-white/6 px-4 py-1 text-sm text-white/72 backdrop-blur-md">
            Personal Web Memory · Dashboard
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
            个人浏览记忆面板
          </h1>
        </section>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-white/8 p-1 backdrop-blur-md w-fit">
          <button
            onClick={() => setTab("digest")}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition ${tab === "digest" ? "bg-white text-slate-900 shadow" : "text-white/70 hover:text-white"}`}
          >
            每日总结
          </button>
          <button
            onClick={() => setTab("favorites")}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition ${tab === "favorites" ? "bg-white text-slate-900 shadow" : "text-white/70 hover:text-white"}`}
          >
            我的收藏
          </button>
        </div>

        {tab === "digest" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_0.4fr]">
            {/* 左侧：时间线 */}
            <div className="space-y-8">
              {Object.entries(groupedByDate).map(([date, datePages]) => (
                <section key={date}>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                    <h3 className="text-lg font-semibold text-white">{date} · {formatDate(date)}</h3>
                  </div>
                  <div className="ml-1.5 border-l-2 border-white/10 pl-6 space-y-3">
                    {datePages.map((page) => (
                      <PageCard key={page.id} page={page} onToggleFavorite={toggleFavorite} />
                    ))}
                  </div>
                </section>
              ))}
              {Object.keys(groupedByDate).length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-12 text-center text-white/50">
                  还没有页面记录。运行扩展并等待数据上传。
                </div>
              )}
            </div>

            {/* 右侧：今日总结 + Top5 主题 */}
            <div className="space-y-6">
              {todayDigest && (
                <div className="rounded-2xl border border-white/10 bg-white/6 p-5 backdrop-blur-md">
                  <h3 className="text-base font-semibold text-white">今日总结</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    {renderMarkdownLinks(todayDigest.summary || "暂无摘要")}
                  </p>
                  <div className="mt-3 flex gap-3 text-xs text-slate-400">
                    <span>{todayDigest.pageCount} 页面</span>
                    <span>·</span>
                    <span>{formatDuration(todayDigest.totalDurationMs)}</span>
                  </div>
                </div>
              )}

              {top5Topics.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/6 p-5 backdrop-blur-md">
                  <h3 className="text-base font-semibold text-white">今日 Top5 主题</h3>
                  <div className="mt-4 space-y-2.5">
                    {top5Topics.map(([topic, count], i) => (
                      <div key={topic} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-300">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm text-slate-200">{topic}</span>
                        <span className="text-xs text-slate-400">{count}次</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {todayDigest && todayDigest.topDomains.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/6 p-5 backdrop-blur-md">
                  <h3 className="text-base font-semibold text-white">Top Domains</h3>
                  <div className="mt-4 space-y-3">
                    {todayDigest.topDomains.slice(0, 5).map((d) => (
                      <div key={d.domain} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">{d.domain}</span>
                        <span className="text-slate-400">{formatDuration(d.durationMs)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "favorites" && (
          <div className="space-y-3">
            {favList.length > 0 ? (
              favList.map((page) => (
                <PageCard key={page.id} page={page} onToggleFavorite={toggleFavorite} />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-12 text-center text-white/50">
                还没有收藏的页面。点击页面卡片上的 ☆ 来收藏。
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
