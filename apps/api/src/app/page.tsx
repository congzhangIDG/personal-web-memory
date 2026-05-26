import type { DomainStat } from "@pwm/shared";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.floor(durationMs / 1000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDate(date: string): string {
  const value = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(value);
}

export default async function Home() {
  const rows = await prisma.dailyDigest.findMany({
    orderBy: { date: "desc" },
    take: 30,
  });

  const items = rows.map((row) => ({
    id: row.id,
    date: row.date,
    summary: row.summary,
    pageCount: row.pageCount,
    totalDurationMs: row.totalDurationMs,
    topDomains: JSON.parse(row.topDomains) as DomainStat[],
  }));

  const latestDigest = items[0] ?? null;
  const totalPages = items.reduce((sum, item) => sum + item.pageCount, 0);
  const totalDurationMs = items.reduce(
    (sum, item) => sum + item.totalDurationMs,
    0,
  );
  const totalDigests = items.length;
  const maxDomainDuration = Math.max(
    ...(latestDigest?.topDomains.map((item) => item.durationMs) ?? [1]),
  );

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,_rgba(106,125,255,0.22),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(86,211,154,0.12),_transparent_22%),linear-gradient(180deg,_#08101d_0%,_#0b1220_42%,_#111827_100%)] text-white">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 lg:px-10">
        <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center rounded-full border border-white/12 bg-white/6 px-4 py-1 text-sm text-white/72 backdrop-blur-md">
              Personal Web Memory · Dashboard
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
                个人浏览记忆面板
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                自动汇总每日浏览轨迹，生成可回顾的主题、时长与摘要。当前页面展示最近上传的 Daily Digest 结果。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["隐私优先", "本地优先存储"],
              ["自动运行", "按日聚合上传"],
              ["AI 总结", "支持每日摘要生成"],
            ].map(([title, desc]) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-white/6 px-5 py-4 shadow-[0_16px_50px_rgba(0,0,0,0.22)] backdrop-blur-md"
              >
                <div className="text-sm font-medium text-white">{title}</div>
                <div className="mt-1 text-sm text-slate-300">{desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.96] p-6 text-slate-900 shadow-[0_30px_80px_rgba(0,0,0,0.32)] lg:p-8">
            <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-medium text-slate-500">
                  {latestDigest ? formatDate(latestDigest.date) : "暂无数据"}
                </div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  今日工作记忆
                </h2>
              </div>
              <div className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white">
                最近 30 天 Digest
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                ["访问页面", String(totalPages)],
                ["有效浏览", formatDuration(totalDurationMs)],
                ["已汇总", String(totalDigests)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4"
                >
                  <div className="text-sm text-slate-500">{label}</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-slate-950">
                    历史 Digest
                  </h3>
                  <div className="text-sm text-slate-500">按日期倒序</div>
                </div>

                <div className="space-y-4">
                  {items.length > 0 ? (
                    items.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-blue-600">
                              {item.date} · {formatDate(item.date)}
                            </div>
                            <h4 className="text-xl font-semibold text-slate-950">
                              {item.summary.trim() || "尚未生成 AI 摘要"}
                            </h4>
                            <div className="flex flex-wrap gap-2 text-sm text-slate-500">
                              <span>{item.pageCount} 个页面</span>
                              <span>·</span>
                              <span>{formatDuration(item.totalDurationMs)}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 md:max-w-64 md:justify-end">
                            {item.topDomains.slice(0, 4).map((domain) => (
                              <span
                                key={`${item.id}-${domain.domain}`}
                                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                              >
                                {domain.domain}
                              </span>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-500">
                      还没有上传的 Digest。先运行扩展并等待定时聚合上传。
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-950">
                      最近摘要
                    </h3>
                    <span className="text-xs text-slate-500">
                      {latestDigest?.date ?? "--"}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-600">
                    {latestDigest?.summary.trim() ||
                      "最近一次上传尚未包含 AI 摘要，可以在后续步骤接入自动总结生成。"}
                  </p>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-950">
                      Top Domains
                    </h3>
                    <span className="text-xs text-slate-500">最近一次 Digest</span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {latestDigest?.topDomains.length ? (
                      latestDigest.topDomains.slice(0, 5).map((item) => {
                        const percent = Math.max(
                          8,
                          Math.round((item.durationMs / maxDomainDuration) * 100),
                        );

                        return (
                          <div key={item.domain} className="space-y-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="truncate font-medium text-slate-800">
                                {item.domain}
                              </span>
                              <span className="shrink-0 text-slate-500">
                                {formatDuration(item.durationMs)}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200">
                              <div
                                className="h-2 rounded-full bg-[linear-gradient(90deg,_#4f46e5,_#22c55e)]"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-slate-500">
                        暂无 domain 聚合数据。
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
