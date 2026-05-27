// ⚙️ 系统设置管理（AI 提示词等全局配置）
// 支持从 DB 读取，运行时缓存，写入时自动失效

import { prisma } from "@/lib/prisma";

export const SETTING_KEYS = {
  pageSummarySystemPrompt: "page_summary_system_prompt",
  digestSummarySystemPrompt: "digest_summary_system_prompt",
  digestChunkSystemPrompt: "digest_chunk_system_prompt",
  tagExtractionSystemPrompt: "tag_extraction_system_prompt",
  domainTagMap: "domain_tag_map",
  techKeywords: "tech_keywords",
} as const;

const DEFAULT_SETTINGS: Record<string, string> = {
  [SETTING_KEYS.pageSummarySystemPrompt]:
    "你是一个客观的网页摘要助手。只根据提供的文本生成摘要，不添加任何外部知识或推断。",
  [SETTING_KEYS.digestSummarySystemPrompt]:
    "你是一个个人知识工作流助手，负责把浏览统计整理成简洁可信的中文日总结。",
  [SETTING_KEYS.digestChunkSystemPrompt]:
    "你是一个浏览记录分组整理助手。",
  [SETTING_KEYS.tagExtractionSystemPrompt]:
    "你是一个网页内容理解助手。根据网页标题和域名，判断文章的核心主题要义，生成精准、具体的中文话题标签。避免宽泛标签，要体现文章的具体内容方向。",
  [SETTING_KEYS.domainTagMap]: "",
  [SETTING_KEYS.techKeywords]: "",
};

/** 所有可配置的键列表（用于 UI 展示） */
export const SETTING_META: Array<{ key: string; label: string; description: string }> = [
  {
    key: SETTING_KEYS.pageSummarySystemPrompt,
    label: "网页摘要 - 系统提示词",
    description: "每条网页抓取后，生成事实摘要时使用的系统级提示词。",
  },
  {
    key: SETTING_KEYS.digestSummarySystemPrompt,
    label: "每日总结 - 综合摘要提示词",
    description: "对所有页面汇总生成当日总结时使用的系统级提示词。用于总结 ≤30 页直接总结 和 多块最终合成。",
  },
  {
    key: SETTING_KEYS.digestChunkSystemPrompt,
    label: "每日总结 - 分组摘要提示词",
    description: "当日页数超过 30 时，先分块摘要时使用的系统级提示词。",
  },
  {
    key: SETTING_KEYS.tagExtractionSystemPrompt,
    label: "标签提取 - 系统提示词",
    description: "调用 AI 批量生成话题标签时使用的系统级提示词。",
  },
  {
    key: SETTING_KEYS.domainTagMap,
    label: "域名标签映射表（JSON）",
    description: "规则匹配回退时，域名→标签的映射表。格式：{\"域名\": [\"标签1\",\"标签2\"]}。留空则使用代码内置映射。",
  },
  {
    key: SETTING_KEYS.techKeywords,
    label: "技术关键词列表（JSON 数组）",
    description: "规则匹配回退时，从标题中提取的关键词列表。格式：[\"React\",\"TypeScript\",...]。留空则使用代码内置列表。",
  },
];

// 内存缓存
let cache: Record<string, string> | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 分钟

export async function getAppSettings(): Promise<Record<string, string>> {
  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    return cache;
  }
  const rows = await prisma.appSetting.findMany();
  const dbMap: Record<string, string> = {};
  for (const row of rows) {
    dbMap[row.key] = row.value;
  }
  cache = { ...DEFAULT_SETTINGS, ...dbMap };
  cacheTime = Date.now();
  return cache;
}

/** 获取单个设置值（含默认值回退） */
export async function getAppSetting(key: string): Promise<string> {
  const all = await getAppSettings();
  return all[key] ?? DEFAULT_SETTINGS[key] ?? "";
}

/** 批量更新设置，只在传入 key 属于已知键时才写入 */
export async function updateAppSettings(
  updates: Record<string, string>,
): Promise<void> {
  const validKeys = new Set(Object.keys(DEFAULT_SETTINGS));
  for (const [key, value] of Object.entries(updates)) {
    if (!validKeys.has(key)) continue;
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  cache = null; // 失效缓存
}
