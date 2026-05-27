"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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

const SUMMARY_TRUNCATE = 250;

function DigestDomainList({ domains, pages }: { domains: [string, number][]; pages: PageItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const [hoveredDomain, setHoveredDomain] = useState<string | null>(null);
  const visible = showAll ? domains : domains.slice(0, 10);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h4 className="text-xs font-medium text-white/50 mb-2">Domains TOP {showAll ? domains.length : Math.min(10, domains.length)}</h4>
      <div className="space-y-1">
        {visible.map(([domain, count]) => (
          <div
            key={domain}
            className="relative flex items-center justify-between text-sm"
            onMouseEnter={() => setHoveredDomain(domain)}
            onMouseLeave={() => setHoveredDomain(null)}
          >
            <span className="text-emerald-300 truncate cursor-default">{domain}</span>
            <span className="text-white/40 text-xs ml-2 shrink-0">{count}</span>
            {hoveredDomain === domain && (
              <div className="absolute left-0 top-full mt-1 z-50 w-80 max-h-60 overflow-y-auto rounded-lg border border-white/15 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md">
                {pages.filter((p) => p.domain === domain).map((p) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block py-1.5 border-b border-white/5 last:border-0 hover:bg-white/5 -mx-1 px-1 rounded"
                  >
                    <div className="text-xs text-white/80 truncate">{p.title || p.url}</div>
                    <div className="text-[10px] text-white/30">{new Date(p.visitedAt).toLocaleString("zh-CN")}</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {domains.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs text-white/40 hover:text-white/70 transition"
        >
          {showAll ? "收起" : `更多 (共 ${domains.length} 个)`}
        </button>
      )}
    </div>
  );
}

function TopicTagCloud({ topics, pages }: { topics: [string, number][]; pages: PageItem[] }) {
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const max = topics[0]?.[1] || 1;
  const cloudSize = (count: number) => {
    const ratio = count / max;
    if (ratio > 0.7) return "text-base font-semibold";
    if (ratio > 0.4) return "text-sm font-medium";
    return "text-xs";
  };
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h4 className="text-xs font-medium text-white/50 mb-2">主题标签云</h4>
      <div className="flex flex-wrap gap-1.5">
        {topics.slice(0, 40).map(([tag, count]) => (
          <span
            key={tag}
            className={`relative rounded-full bg-blue-500/15 px-2.5 py-0.5 text-blue-300 cursor-default ${cloudSize(count)}`}
            onMouseEnter={() => setHoveredTag(tag)}
            onMouseLeave={() => setHoveredTag(null)}
          >
            {tag}
            <span className="ml-1 text-blue-300/50">×{count}</span>
            {hoveredTag === tag && (
              <div className="absolute left-0 top-full mt-1 z-50 w-80 max-h-60 overflow-y-auto rounded-lg border border-white/15 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md">
                {pages.filter((p) => p.topics.includes(tag)).map((p) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block py-1.5 border-b border-white/5 last:border-0 hover:bg-white/5 -mx-1 px-1 rounded"
                  >
                    <div className="text-xs text-white/80 truncate">{p.title || p.url}</div>
                    <div className="text-[10px] text-white/30">{p.domain} · {new Date(p.visitedAt).toLocaleString("zh-CN")}</div>
                  </a>
                ))}
              </div>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function PageCard({ page, onToggleFavorite, onTopicClick, onDelete }: { page: PageItem; onToggleFavorite: (id: number) => void; onTopicClick?: (topic: string) => void; onDelete?: (id: number) => void }) {
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
        {onDelete && (
          <button
            onClick={() => onDelete(page.id)}
            className="shrink-0 rounded-lg p-1.5 text-sm text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-all"
            title="移除"
          >
            ✕
          </button>
        )}
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

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定移除这条记录？")) return;
    const res = await fetch(`/api/pages/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    window.location.reload();
  };

  const [regenerating, setRegenerating] = useState<string | null>(null);

  const handleRegenerate = async (date: string) => {
    setRegenerating(date);
    try {
      const res = await fetch("/api/digest/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const err = await res.json();
        alert(err.error || "重新生成失败");
      }
    } catch {
      alert("重新生成失败");
    } finally {
      setRegenerating(null);
    }
  };

  // ─── 数据计算（hooks 顺序：state → ref → useMemo → useEffect）───

  const groupedByDate = useMemo(() => {
    const map: Record<string, PageItem[]> = {};
    pageList.forEach((p) => {
      if (!map[p.date]) map[p.date] = [];
      map[p.date].push(p);
    });
    return map;
  }, [pageList]);

  const topicMap = useMemo(() => {
    const map: Record<string, PageItem[]> = {};
    pageList.forEach((p) => {
      p.topics.forEach((t) => {
        if (!map[t]) map[t] = [];
        map[t].push(p);
      });
    });
    return map;
  }, [pageList]);

  const sortedTopics = useMemo(() => {
    return Object.entries(topicMap).sort((a, b) => b[1].length - a[1].length);
  }, [topicMap]);

  const timelinePageSize = PAGE_SIZE;
  const totalTimelinePages = Math.ceil(pageList.length / timelinePageSize);
  const paginatedPages = pageList.slice(0, timelinePage * timelinePageSize);
  const paginatedGrouped = useMemo(() => {
    const map: Record<string, PageItem[]> = {};
    paginatedPages.forEach((p) => {
      if (!map[p.date]) map[p.date] = [];
      map[p.date].push(p);
    });
    return map;
  }, [paginatedPages]);

  const sectionIds = useMemo(() => {
    if (tab === "timeline") return Object.keys(groupedByDate).map((d) => `date-${d}`);
    if (tab === "topics") return sortedTopics.map(([t]) => `topic-${t}`);
    return [];
  }, [tab, groupedByDate, sortedTopics]);

  // ─── Effects ───

  useEffect(() => {
    if (tab === "topics" && activeTopic) {
      const el = topicRefs.current[activeTopic];
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: "smooth" });
      }
    }
  }, [tab, activeTopic]);

  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 侧边栏导航 - 当前激活的 section
  const [activeNav, setActiveNav] = useState<string | null>(null);
  const activeNavRef = useRef<string | null>(null);
  const navClickTimeRef = useRef(0);

  const scrollToSection = (id: string) => {
    activeNavRef.current = id;
    setActiveNav(id);
    navClickTimeRef.current = Date.now();
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (sectionIds.length === 0) return;
    const els = sectionIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;

    activeNavRef.current = sectionIds[0];
    setActiveNav(sectionIds[0]);
    const handleScroll = () => {
      if (Date.now() - navClickTimeRef.current < 1200) return;
      let current: string | null = null;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= 90) {
          current = el.id;
        }
      }
      if (!current) current = els[0]?.id ?? null;
      if (current && current !== activeNavRef.current) {
        activeNavRef.current = current;
        setActiveNav(current);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sectionIds]);

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

  const tabs = [
    { key: "timeline" as const, label: "时间线" },
    { key: "topics" as const, label: "主题" },
    { key: "digest" as const, label: "每日总结" },
    { key: "favorites" as const, label: "我的收藏" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,_rgba(106,125,255,0.22),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(86,211,154,0.12),_transparent_22%),linear-gradient(180deg,_#08101d_0%,_#0b1220_42%,_#111827_100%)] text-white">
      {/* 顶部导航条 */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#08101d]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-2 lg:px-10">
          <span className="text-sm font-medium text-white/70">PWM</span>
          <nav className="flex gap-1 rounded-lg bg-white/8 p-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-white/60 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <a href="/settings" className="ml-auto text-xl text-white/40 hover:text-white transition-colors" title="系统设置">
            ⚙️
          </a>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-row gap-8 px-6 py-6 lg:px-10">

        {/* 侧边栏导航 */}
        {(tab === "timeline" || tab === "topics") && sectionIds.length > 0 && (
          <nav className="sticky top-14 hidden h-fit w-40 shrink-0 lg:block">
            <div className="space-y-0.5 border-l-2 border-white/10 pl-3">
              {sectionIds.map((id) => {
                const label = tab === "timeline"
                  ? id.replace("date-", "")
                  : id.replace("topic-", "");
                const count = tab === "timeline"
                  ? (groupedByDate[id.replace("date-", "")]?.length ?? 0)
                  : (topicMap[id.replace("topic-", "")]?.length ?? 0);
                const isActive = activeNav === id;
                return (
                  <button
                    key={id}
                    onClick={() => scrollToSection(id)}
                    className={`flex w-full items-center gap-1 text-left text-sm leading-8 transition-colors ${
                      isActive
                        ? "border-l-2 border-blue-400 -ml-[14px] pl-[12px] text-blue-400 font-medium"
                        : "text-white/50 hover:text-white/70 hover:border-l-2 hover:border-white/30 hover:-ml-[14px] hover:pl-[12px]"
                    }`}
                  >
                    <span className="truncate">{label}</span>
                    <span className="shrink-0 text-xs text-white/30 font-normal">({count})</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        {/* 内容区 */}
        <div className="min-w-0 flex-1">
        {/* 时间线 Tab */}
        {tab === "timeline" && (
          <div className="space-y-8">
            {Object.entries(paginatedGrouped).map(([date, datePages]) => (
              <section key={date} id={`date-${date}`}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <h3 className="text-lg font-semibold text-white">{date} · {formatDate(date)}</h3>
                  <span className="text-xs text-slate-400">{groupedByDate[date]?.length ?? datePages.length} 条记录</span>
                </div>
                <div className="ml-1.5 border-l-2 border-white/10 pl-6 space-y-3">
                    {datePages.map((page) => (
                      <PageCard key={page.id} page={page} onToggleFavorite={toggleFavorite} onTopicClick={handleTopicClick} onDelete={handleDelete} />
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
            {/* 标签云 + Domains 统计 */}
            {digests.length > 0 && (() => {
              // 基于所有网页的 topics 统计
              const topicCounts: Record<string, number> = {};
              pageList.forEach((p) => {
                p.topics.forEach((t) => { topicCounts[t] = (topicCounts[t] || 0) + 1; });
              });
              const sortedTopicCloud = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
              // 基于所有网页的 domain 统计（按页面数）
              const domainCounts: Record<string, number> = {};
              pageList.forEach((p) => { domainCounts[p.domain] = (domainCounts[p.domain] || 0) + 1; });
              const sortedDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sortedTopicCloud.length > 0 && (
                    <TopicTagCloud topics={sortedTopicCloud} pages={pageList} />
                  )}
                  {sortedDomains.length > 0 && (
                    <DigestDomainList domains={sortedDomains} pages={pageList} />
                  )}
                </div>
              );
            })()}
            {digests.length > 0 ? (
              digests.map((d) => {
                // 统一使用 pageList 过滤出的当日页面，确保页面数统计一致
                const dayPages = pageList.filter((p) => p.date === d.date);
                const dayPageCount = dayPages.length;
                const dayTotalDuration = dayPages.reduce((sum, p) => sum + p.durationMs, 0);
                return (
                <article key={d.id} className="rounded-2xl border border-white/10 bg-white/6 p-6 backdrop-blur-md space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">{d.date} · {formatDate(d.date)}</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRegenerate(d.date)}
                        disabled={regenerating === d.date}
                        className="rounded-lg bg-white/8 px-3 py-1 text-xs text-white/60 hover:text-white hover:bg-white/15 transition disabled:opacity-40"
                      >
                        {regenerating === d.date ? "生成中…" : "重新生成"}
                      </button>
                      <div className="flex gap-3 text-xs text-slate-400">
                        <span>{dayPageCount} 页面</span>
                        <span>·</span>
                        <span>{formatDuration(dayTotalDuration)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-sm leading-7 text-slate-300 whitespace-pre-wrap">
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
                  {d.topics.length > 0 && (() => {
                    const tagCounts: Record<string, number> = {};
                    dayPages.forEach((p) => p.topics.forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {d.topics.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-medium text-blue-300 cursor-pointer hover:bg-blue-500/25 transition"
                            onClick={() => handleTopicClick(tag)}
                          >
                            {tag}{tagCounts[tag] ? ` (${tagCounts[tag]})` : ""}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  {dayPages.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200 transition-colors select-none">
                        查看当日 {dayPages.length} 个页面详情 ▾
                      </summary>
                      <div className="mt-3 space-y-3">
                        {dayPages.map((page) => (
                          <PageCard key={page.id} page={page} onToggleFavorite={toggleFavorite} onTopicClick={handleTopicClick} onDelete={handleDelete} />
                        ))}
                      </div>
                    </details>
                  )}
                </article>
              );
              })
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
        </div>{/* /内容区 */}
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
