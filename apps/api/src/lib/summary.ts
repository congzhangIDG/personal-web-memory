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

/**
 * 抓取网页内容并生成事实摘要（≤500 字）
 *
 * 策略：1) LLM 摘要（优先）；2) 直接截取前 500 字（回退）
 * 不会编造内容——摘要内容完全来自页面原始文本。
 */
async function generateAiPageSummary(
  title: string,
  content: string,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const apiBase = process.env.OPENAI_API_BASE;
  const modelId = process.env.OPENAI_MODEL_ID;

  if (!apiKey || !apiBase || !modelId) return null;

  const prompt = [
    "以下是一段网页正文内容。请用流畅自然的中文写一段完整的摘要。",
    "要求：",
    "  1. 完全基于提供的文本，不要添加原文没有的信息",
    "  2. 使用简体中文，语句通顺连贯，过渡自然",
    "  3. 写成一个完整的段落，不要用列表或分点",
    "  4. 保证语义完整，不要中途截断",
    "  5. 用平实的叙述性语言，不要用'本文介绍了'、'该页面讨论了'等套话",
    "  6. 控制在 500 字以内",
    "",
    `标题：${title}`,
    "",
    `正文片段：\n${content.slice(0, 3000)}`,
  ].join("\n");

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.3,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              "你是一个客观的网页摘要助手。只根据提供的文本生成摘要，不添加任何外部知识或推断。",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content?.slice(0, 500) ?? null;
  } catch {
    return null;
  }
}

/**
 * 为单个页面生成事实摘要。
 * 1) 尝试抓取页面 HTML、提取正文、调用 LLM 摘要
 * 2) LLM 不可用时直接截取前 500 字
 * 3) 完全无法获取内容时返回 null
 */
export async function generatePageSummary(
  url: string,
  title: string,
): Promise<string | null> {
  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PWM-SummaryBot/1.0; +https://github.com/your-repo)",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    html = await response.text();
  } catch {
    return null;
  }

  // 移除 script/style 标签及内容，再剥离 HTML 标签
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 30) return null;

  const excerpt = text.slice(0, 3000);

  const llmSummary = await generateAiPageSummary(title, excerpt);
  if (llmSummary) return llmSummary;

  return excerpt.slice(0, 500).trim();
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
