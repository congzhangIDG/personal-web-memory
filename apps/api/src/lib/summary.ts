import type { DomainStat } from "@pwm/shared";
import { getAppSetting, getLlmConfig, SETTING_KEYS } from "@/lib/settings";

type PageRef = {
  title: string;
  url: string;
  domain: string;
  durationMs: number;
  summary?: string;
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

/**
 * 对一组页面做组内摘要（用于大容量分块场景）
 */
async function summarizeChunk(
  date: string,
  chunkIndex: number,
  totalChunks: number,
  pages: PageRef[],
): Promise<string | null> {
  const { apiKey, apiBase, modelId } = await getLlmConfig();
  if (!apiKey || !apiBase || !modelId) return null;

  const pagesSection = pages
    .map((p, i) => {
      let line = `${i + 1}. [${p.title}](${p.url}) — ${p.domain}，停留 ${formatDuration(p.durationMs)}`;
      if (p.summary) line += `\n   摘要：${p.summary.slice(0, 300)}`;
      return line;
    })
    .join("\n\n");

  const prompt = [
    `以下是 ${date} 浏览记录的第 ${chunkIndex + 1}/${totalChunks} 组（共 ${pages.length} 个页面）。`,
    "",
    pagesSection,
    "",
    "请用简体中文写一段 200~300 字的组内总结。",
    "要求：",
    "  1. 提炼该组页面的核心主题和共同关注点；",
    "  2. 指出页面之间的关联或递进关系；",
    "  3. 引用相关页面（Markdown 链接格式）。",
  ].join("\n");

  const chunkSystemPrompt = await getAppSetting(SETTING_KEYS.digestChunkSystemPrompt);

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.4,
        messages: [
          { role: "system", content: chunkSystemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * 基于分块摘要合成最终日总结
 */
async function synthesizeFinalSummary(
  date: string,
  pageCount: number,
  totalDurationMs: number,
  topDomains: string,
  chunkSummaries: string[],
): Promise<string | null> {
  const { apiKey, apiBase, modelId } = await getLlmConfig();
  if (!apiKey || !apiBase || !modelId) return null;

  const chunksText = chunkSummaries
    .map((s, i) => `【第 ${i + 1} 组总结】\n${s}`)
    .join("\n\n");

  const digestSystemPrompt = await getAppSetting(SETTING_KEYS.digestSummarySystemPrompt);

  const prompt = [
    `日期：${date}`,
    `访问页面总数：${pageCount}`,
    `总活跃时长：${formatDuration(totalDurationMs)}`,
    `Top Domains：\n${topDomains}`,
    "",
    "以下是各分组的浏览总结：",
    chunksText,
    "",
    "请基于以上分组总结，用简体中文撰写一篇综合性的每日浏览总结（400~600 字）。",
    "要求：",
    "1）分析当日关注的**核心主题**和**知识脉络**，找出页面之间的关联与递进关系；",
    "2）不是简单罗列网页，而是对全天浏览内容进行**二次提炼和综合**；",
    "3）在总结中引用相关页面，使用 Markdown 链接格式 [标题](url)；",
    "4）指出浏览重点、时长分布特征以及知识收获；",
    "5）结构清晰：先用一句话概括当日焦点，再分层展开各个主题，最后简要总结。",
  ].join("\n\n");

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.4,
        messages: [
          { role: "system", content: "你是一个个人知识工作流助手，负责把浏览统计整理成简洁可信的中文日总结。" },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`synthesizeFinalSummary failed: ${response.status}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

const CHUNK_SIZE = 30;

async function generateAiSummary(input: DigestSummaryInput): Promise<string | null> {
  const { apiKey, apiBase, modelId } = await getLlmConfig();

  if (!apiKey || !apiBase || !modelId) return null;

  const pages = input.pages ?? [];
  const topDomainsText = input.topDomains
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.domain}，访问 ${item.count} 次，时长 ${formatDuration(item.durationMs)}`)
    .join("\n");

  // ── 小量页面：直接单次总结 ──
  if (pages.length <= CHUNK_SIZE) {
    return await summarizeAllAtOnce(input, topDomainsText);
  }

  // ── 大量页面：先分块总结，再综合 ──
  const chunks: PageRef[][] = [];
  for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
    chunks.push(pages.slice(i, i + CHUNK_SIZE));
  }

  const chunkSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const s = await summarizeChunk(input.date, i, chunks.length, chunks[i]);
    if (s) chunkSummaries.push(s);
  }

  if (chunkSummaries.length === 0) return null;

  // 如果只有一组有结果，直接返回
  if (chunkSummaries.length === 1) return chunkSummaries[0];

  return await synthesizeFinalSummary(
    input.date,
    input.pageCount,
    input.totalDurationMs,
    topDomainsText,
    chunkSummaries,
  );
}

/**
 * 单次直接总结（≤30 页）
 */
async function summarizeAllAtOnce(
  input: DigestSummaryInput,
  topDomainsText: string,
): Promise<string | null> {
  const { apiKey, apiBase, modelId } = await getLlmConfig();
  if (!apiKey || !apiBase || !modelId) return null;

  const pages = input.pages ?? [];
  const pagesSection = pages.length > 0
    ? pages
        .map((p, i) => {
          let line = `${i + 1}. [${p.title}](${p.url}) — ${p.domain}，停留 ${formatDuration(p.durationMs)}`;
          if (p.summary) line += `\n   摘要：${p.summary.slice(0, 300)}`;
          return line;
        })
        .join("\n\n")
    : "无";

  const prompt = [
    `日期：${input.date}`,
    `访问页面数：${input.pageCount}`,
    `总活跃时长：${formatDuration(input.totalDurationMs)}`,
    `Top Domains：\n${topDomainsText || "无"}`,
    `主要访问页面（含标题、链接、停留时长、页面摘要）：\n${pagesSection}`,
    "请基于以上数据，用简体中文撰写一段综合性的每日浏览总结（400~600 字）。",
    "要求：",
    "1）分析当日关注的**核心主题**和**知识脉络**，找出页面之间的关联与递进关系；",
    "2）不是简单罗列网页，而是对全天浏览内容进行**二次提炼和综合**；",
    "3）在总结中引用相关页面，使用 Markdown 链接格式 [标题](url)；",
    "4）指出浏览重点、时长分布特征以及知识收获；",
    "5）结构清晰：先用一句话概括当日焦点，再分层展开各个主题，最后简要总结。",
  ].join("\n\n");

  const digestSystemPrompt = await getAppSetting(SETTING_KEYS.digestSummarySystemPrompt);

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.4,
        messages: [
          { role: "system", content: digestSystemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`summarizeAllAtOnce failed: ${response.status}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * 由大模型生成网页事实摘要（≤1000 字）
 *
 * 策略：1) LLM 摘要（优先）；2) 直接截取前 1000 字（回退）
 * 不会编造内容——摘要内容完全来自页面原始文本。
 */
async function generateAiPageSummary(
  title: string,
  content: string,
): Promise<string | null> {
  const { apiKey, apiBase, modelId } = await getLlmConfig();

  if (!apiKey || !apiBase || !modelId) return null;

  const prompt = [
    "以下是一段网页正文内容。请根据原文撰写一篇完整的摘要。",
    "要求：",
    "  1. 完全基于提供的文本，不要添加原文没有的信息",
    "  2. 使用简体中文，语句通顺连贯，过渡自然",
    "  3. 写成一个完整的段落，不要用列表或分点",
    "  4. 保证语义完整，涵盖原文**主要内容**和**关键论点**，不要遗漏重要信息",
    "  5. 用平实的叙述性语言，不要用'本文介绍了'、'该页面讨论了'等套话",
    "  6. 篇幅控制在 1000 字以内，覆盖原文核心内容即可",
    "",
    `标题：${title}`,
    "",
    `正文片段：\n${content.slice(0, 6000)}`,
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
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content: await getAppSetting(SETTING_KEYS.pageSummarySystemPrompt),
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
    return content?.slice(0, 1000) ?? null;
  } catch {
    return null;
  }
}

/**
 * 为单个页面生成事实摘要。
 * 1) 尝试抓取页面 HTML、提取正文、调用 LLM 摘要（≤1000字）
 * 2) LLM 不可用时直接截取前 1000 字
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

  return excerpt.slice(0, 1000).trim();
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
