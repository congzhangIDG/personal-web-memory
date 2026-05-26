import type { DomainStat } from "@pwm/shared";

type PageRef = {
  title: string;
  url: string;
  domain: string;
  durationMs: number;
};

type DigestSummaryInput = {
  date: string;
  pageCount: number;
  totalDurationMs: number;
  topDomains: DomainStat[];
  pages?: PageRef[];
};

function formatDuration(durationMs: number): string {
  const totalSec = Math.floor(durationMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}秒`;
  return `${m}分${s}秒`;
}

function buildFallbackSummary(input: DigestSummaryInput): string {
  const domainText = input.topDomains
    .slice(0, 3)
    .map((item) => `${item.domain}（${formatDuration(item.durationMs)}）`)
    .join("、");

  return [
    `${input.date} 共浏览 ${input.pageCount} 个页面，累计有效浏览 ${formatDuration(input.totalDurationMs)}。`,
    domainText
      ? `主要关注的网站包括：${domainText}。`
      : "当天暂无可用的 domain 聚合结果。",
    "这是一条规则生成摘要；当 AI 服务可用时会自动替换为更自然的总结。",
  ].join("");
}

async function generateAiSummary(input: DigestSummaryInput): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const apiBase = process.env.OPENAI_API_BASE;
  const modelId = process.env.OPENAI_MODEL_ID;

  if (!apiKey || !apiBase || !modelId) {
    return null;
  }

  const topDomains = input.topDomains
    .slice(0, 5)
    .map(
      (item, index) =>
        `${index + 1}. ${item.domain}，访问 ${item.count} 次，时长 ${formatDuration(item.durationMs)}`,
    )
    .join("\n");

  const pagesSection = input.pages && input.pages.length > 0
    ? input.pages
        .slice(0, 10)
        .map((p, i) => `${i + 1}. [${p.title}](${p.url}) — ${p.domain}，停留 ${formatDuration(p.durationMs)}`)
        .join("\n")
    : "无";

  const prompt = [
    `日期：${input.date}`,
    `访问页面数：${input.pageCount}`,
    `总活跃时长：${formatDuration(input.totalDurationMs)}`,
    `Top Domains：\n${topDomains || "无"}`,
    `主要访问页面：\n${pagesSection}`,
    "请基于以上数据，用简体中文生成 100~200 字的每日浏览总结。",
    "要求：",
    "1）自然、克制；",
    "2）突出主要关注主题；",
    "3）在总结中引用相关页面，使用 Markdown 链接格式 [标题](url)；",
    "4）至少引用 2~5 个最相关的页面链接。",
  ].join("\n\n");

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "你是一个个人知识工作流助手，负责把浏览统计整理成简洁可信的中文日总结。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI summary request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  return content || null;
}

export async function getDigestSummary(input: DigestSummaryInput): Promise<string> {
  try {
    const aiSummary = await generateAiSummary(input);
    if (aiSummary) {
      return aiSummary;
    }
  } catch (error) {
    console.error("[PWM] AI summary failed, fallback to rules", error);
  }

  return buildFallbackSummary(input);
}
