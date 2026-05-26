import type { DomainStat } from "@pwm/shared";

type DigestSummaryInput = {
  date: string;
  pageCount: number;
  totalDurationMs: number;
  topDomains: DomainStat[];
};

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.floor(durationMs / 1000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} 分钟`;
  }

  return `${hours} 小时 ${minutes} 分钟`;
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

  const prompt = [
    `日期：${input.date}`,
    `访问页面数：${input.pageCount}`,
    `总活跃时长：${formatDuration(input.totalDurationMs)}`,
    `Top Domains：\n${topDomains || "无"}`,
    "请基于以上数据，用简体中文生成 80~140 字的每日浏览总结。",
    "要求：1）自然、克制；2）突出主要关注主题；3）不要编造未给出的具体页面标题。",
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
