"use client";

import { useState, useEffect, useRef } from "react";
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

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

const SUMMARY_TRUNCATE = 100;

function PageCard({ page, onToggleFavorite, onTopicClick }: { page: PageItem; onToggleFavorite: (id: number) => void; onTopicClick?: (topic: string) => void }) {
  const [showFullSummary, setShowFullSummary] = useState(false);
  const summary = page.summary || "";
  const needsTruncation = summary.length > SUMMARY_TRUNCATE;
  const displaySummary = needsTruncation && !showFullSummary
    ? summary.slice(0, SUMMARY_TRUNCATE) + "…"
    : summary;

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
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-base font-medium text-slate-900 min-w-0">
              <a href={page.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline">
                {page.title || page.url}
              </a>
            </h4>
            <span className="shrink-0 text-xs text-slate-400 leading-6">{formatDateTime(page.visitedAt)}</span>
          </div>
          {summary && (
            <p className="text-sm leading-6 text-slate-600">
              {displaySummary}
              {needsTruncation && (
                <button
                  onClick={() => setShowFullSummary(!showFullSummary)}
                  className="ml-1 text-blue-500 hover:text-blue-700 text-xs font-medium"
                >
                  {showFullSummary ? "收起" : "更多"}
                </button>
              )}
            </p>
          )}
          {page.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {page.topics.slice(0, 5).map((tag) => (
                <button
                  key={tag}
                  onClick={() => onTopicClick?.(tag)}
                  className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => onToggleFavorite(page.id)}
          className={`shrink-0 rounded-lg p-1.5 text-xl transition-all duration-150 ${
            page.favorited
              ? "bg-amber-100 text-amber-500 shadow-sm ring-1 ring-amber-300 hover:bg-amber-200"
              : "text-slate-300 hover:bg-amber-50 hover:text-amber-400 hover:ring-1 hover:ring-amber-200"
          }`}
          title={page.favorited ? "取消收藏" : "收藏"}
        >
          {page.favorited ? "⭐" : "☆"}
        </button>
      </div>
    </article>
  );
}

export default function Dashboard({ digests, pages, favorites }: Props) {
  const [tab, setTab] = useState<"timeline" | "topics" | "digest" | "favorites">("timeline");
  const [pageList, setPageList] = useState(pages);
  const [favList, setFavList] = useState(favorites);
  const [timelinePage, setTimelinePage] = useState(1);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const topicRefs = useRef<Record<string, HTMLElement | null>>({});
  const PAGE_SIZE = 20;
  const topicsContainerRef = useRef<HTMLDivElement>(null);

  const handleTopicClick = (topic: string) => {
    setActiveTopic(topic);
    setTab("topics");
  };

  useEffect(() => {
    if (tab === "topics" && activeTopic && topicRefs.current[activeTopic]) {
      topicRefs.current[activeTopic]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [tab, activeTopic]);

  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  // 按日期分组
  const groupedByDate: Record<string, PageItem[]> = {};
  pageList.forEach((p) => {
    if (!groupedByDate[p.date]) groupedByDate[p.date] = [];
    groupedByDate[p.date].push(p);
  });

  // 按主题分组（每个主题下按日期再分组）
  const topicMap: Record<string, PageItem[]> = {};
  pageList.forEach((p) => {
    p.topics.forEach((t) => {
      if (!topicMap[t]) topicMap[t] = [];
      topicMap[t].push(p);
    });
  });
  const sortedTopics = Object.entries(topicMap).sort((a, b) => b[1].length - a[1].length);

  // 时间线分页
  const allDates = Object.keys(groupedByDate);
  const totalTimelinePages = Math.ceil(pageList.length / PAGE_SIZE);
  const paginatedPages = pageList.slice(0, timelinePage * PAGE_SIZE);
  const paginatedGrouped: Record<string, PageItem[]> = {};
  paginatedPages.forEach((p) => {
    if (!paginatedGrouped[p.date]) paginatedGrouped[p.date] = [];
    paginatedGrouped[p.date].push(p);
  });

  const tabs = [
    { key: "timeline" as const, label: "时间线" },
    { key: "topics" as const, label: "主题" },
    { key: "digest" as const, label: "每日总结" },
    { key: "favorites" as const, label: "我的收藏" },
  ];

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
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-5 py-2 text-sm font-medium transition ${tab === t.key ? "bg-white text-slate-900 shadow" : "text-white/70 hover:text-white"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 时间线 Tab */}
        {tab === "timeline" && (
          <div className="space-y-8">
            {Object.entries(paginatedGrouped).map(([date, datePages]) => (
              <section key={date}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <h3 className="text-lg font-semibold text-white">{date} · {formatDate(date)}</h3>
                  <span className="text-xs text-slate-400">{datePages.length} 条记录</span>
                </div>
                <div className="ml-1.5 border-l-2 border-white/10 pl-6 space-y-3">
                    {datePages.map((page) => (
                      <PageCard key={page.id} page={page} onToggleFavorite={toggleFavorite} onTopicClick={handleTopicClick} />
                    ))}
                </div>
              </section>
            ))}
            {Object.keys(paginatedGrouped).length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-12 text-center text-white/50">
                还没有页面记录。运行扩展并等待数据上传。
              </div>
            )}
            {timelinePage < totalTimelinePages && (
              <div className="flex justify-center">
                <button
                  onClick={() => setTimelinePage((p) => p + 1)}
                  className="rounded-lg bg-white/10 px-6 py-2 text-sm font-medium text-white hover:bg-white/20 transition"
                >
                  加载更多
                </button>
              </div>
            )}
          </div>
        )}

        {/* 主题 Tab */}
        {tab === "topics" && (
          <div ref={topicsContainerRef} className="space-y-8">
            {sortedTopics.length > 0 ? (
              sortedTopics.map(([topic, topicPages]) => (
                <section
                  key={topic}
                  id={`topic-${topic}`}
                  ref={(el) => { topicRefs.current[topic] = el; }}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                      activeTopic === topic
                        ? "bg-blue-500/40 text-blue-200 ring-1 ring-blue-400/50"
                        : "bg-blue-500/20 text-blue-300"
                    }`}>
                      {topic}
                    </span>
                    <span className="text-xs text-slate-400">{topicPages.length} 条记录</span>
                  </div>
                  <div className="ml-1.5 border-l-2 border-blue-500/20 pl-6 space-y-3">
                    {topicPages.slice(0, 10).map((page) => (
                      <PageCard key={page.id} page={page} onToggleFavorite={toggleFavorite} onTopicClick={handleTopicClick} />
                    ))}
                    {topicPages.length > 10 && (
                      <p className="text-xs text-slate-400 pl-2">还有 {topicPages.length - 10} 条记录…</p>
                    )}
                  </div>
                </section>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-12 text-center text-white/50">
                还没有主题数据。页面记录上传后会自动归类主题。
              </div>
            )}
          </div>
        )}

        {/* 每日总结 Tab */}
        {tab === "digest" && (
          <div className="space-y-6">
            {digests.length > 0 ? (
              digests.map((d) => (
                <article key={d.id} className="rounded-2xl border border-white/10 bg-white/6 p-6 backdrop-blur-md space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">{d.date} · {formatDate(d.date)}</h3>
                    <div className="flex gap-3 text-xs text-slate-400">
                      <span>{d.pageCount} 页面</span>
                      <span>·</span>
                      <span>{formatDuration(d.totalDurationMs)}</span>
                    </div>
                  </div>
                  <div className="text-sm leading-7 text-slate-300">
                    {renderMarkdownLinks(d.summary || "暂无摘要")}
                  </div>
                  {d.topDomains.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {d.topDomains.slice(0, 5).map((dom) => (
                        <span key={dom.domain} className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-300">
                          {dom.domain} · {formatDuration(dom.durationMs)}
                        </span>
                      ))}
                    </div>
                  )}
                  {d.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {d.topics.map((tag) => (
                        <span key={tag} className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-medium text-blue-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-12 text-center text-white/50">
                还没有每日总结。扩展会在每天结束时自动生成。
              </div>
            )}
          </div>
        )}

        {/* 我的收藏 Tab */}
        {tab === "favorites" && (
          <div className="space-y-3">
            {favList.length > 0 ? (
              favList.map((page) => (
                <PageCard key={page.id} page={page} onToggleFavorite={toggleFavorite} onTopicClick={handleTopicClick} />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-12 text-center text-white/50">
                还没有收藏的页面。点击页面卡片上的 ☆ 来收藏。
              </div>
            )}
          </div>
        )}
      </main>

      {/* 回到顶部 */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700 active:scale-95 ${
          showScrollTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
        aria-label="回到顶部"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}
