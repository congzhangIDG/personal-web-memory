import { prisma } from "@/lib/prisma";
import type { DomainStat } from "@pwm/shared";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const digests = await prisma.dailyDigest.findMany({
    orderBy: { date: "desc" },
    take: 30,
  });

  const pages = await prisma.pageVisit.findMany({
    orderBy: { visitedAt: "desc" },
  });

  const favorites = await prisma.pageVisit.findMany({
    where: { favorited: true },
    orderBy: { createdAt: "desc" },
  });

  const digestItems = digests.map((row) => ({
    id: row.id,
    date: row.date,
    summary: row.summary,
    pageCount: row.pageCount,
    totalDurationMs: row.totalDurationMs,
    topDomains: JSON.parse(row.topDomains) as DomainStat[],
    topics: JSON.parse(row.topics) as string[],
    favorited: row.favorited,
  }));

  const pageItems = pages.map((p) => ({
    id: p.id,
    url: p.url,
    title: p.title,
    domain: p.domain,
    visitedAt: p.visitedAt,
    durationMs: p.durationMs,
    summary: p.summary,
    topics: JSON.parse(p.topics) as string[],
    favorited: p.favorited,
    date: p.date,
  }));

  const favoriteItems = favorites.map((p) => ({
    id: p.id,
    url: p.url,
    title: p.title,
    domain: p.domain,
    visitedAt: p.visitedAt,
    durationMs: p.durationMs,
    summary: p.summary,
    topics: JSON.parse(p.topics) as string[],
    favorited: p.favorited,
    date: p.date,
  }));

  return (
    <Dashboard
      digests={digestItems}
      pages={pageItems}
      favorites={favoriteItems}
    />
  );
}
