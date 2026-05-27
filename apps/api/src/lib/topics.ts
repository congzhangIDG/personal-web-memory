// 自动话题标签生成模块
// 根据页面的 URL/title/domain 生成 1-5 个中文话题标签
//
// 策略：
//   1. 优先使用 LLM 批量生成（当配置了 OPENAI_API_KEY 时）
//   2. LLM 不可用时，使用规则匹配（域名映射 + 标题关键词）
//
// 域名映射表和技术关键词列表支持从 DB 配置覆盖（见 /settings 页面）。

import { getAppSetting, SETTING_KEYS } from "@/lib/settings";

const OPENAI_API_KEY = () => process.env.OPENAI_API_KEY;
const OPENAI_API_BASE = () => process.env.OPENAI_API_BASE;
const OPENAI_MODEL_ID = () => process.env.OPENAI_MODEL_ID;

export type PageInput = {
  url: string;
  title: string;
  domain: string;
};

// ───────────────────────── 规则匹配 ─────────────────────────

/** 域名 → 标签映射（内置缺省值，可在 /settings 中覆盖） */
export const DEFAULT_DOMAIN_TAG_MAP: Record<string, string[]> = {
  "github.com":           ["GitHub", "开发"],
  "stackoverflow.com":    ["Stack Overflow", "开发"],
  "youtube.com":          ["YouTube", "视频"],
  "twitter.com":          ["Twitter", "社交"],
  "x.com":                ["X", "社交"],
  "zhihu.com":            ["知乎", "问答"],
  "juejin.cn":            ["掘金", "技术博客"],
  "medium.com":           ["Medium", "博客"],
  "mp.weixin.qq.com":     ["微信", "公众号"],
  "csdn.net":             ["CSDN", "技术博客"],
  "bilibili.com":         ["B站", "视频"],
  "npmjs.com":            ["npm", "开发"],
  "react.dev":            ["React", "文档"],
  "nextjs.org":           ["Next.js", "文档"],
  "tailwindcss.com":      ["Tailwind CSS", "文档"],
  "vercel.com":           ["Vercel", "部署"],
  "docker.com":           ["Docker", "容器"],
  "docs.docker.com":      ["Docker", "文档"],
  "kubernetes.io":        ["Kubernetes", "容器"],
  "arxiv.org":            ["论文", "学术"],
  "scholar.google.com":   ["学术", "论文"],
  "reddit.com":           ["Reddit", "社区"],
  "news.ycombinator.com": ["Hacker News", "技术新闻"],
  "python.org":           ["Python", "文档"],
  "pypi.org":             ["Python", "包管理"],
  "rust-lang.org":        ["Rust", "文档"],
  "crates.io":            ["Rust", "包管理"],
  "deno.land":            ["Deno", "运行时"],
  "nodejs.org":           ["Node.js", "文档"],
  "developer.mozilla.org":["MDN", "Web开发", "文档"],
  "w3.org":               ["W3C", "Web标准"],
  "whatwg.org":           ["WHATWG", "Web标准"],
  "typescriptlang.org":   ["TypeScript", "文档"],
  "trpc.io":              ["tRPC", "开发"],
  "prisma.io":            ["Prisma", "ORM", "数据库"],
  "planetscale.com":      ["PlanetScale", "数据库"],
  "supabase.com":         ["Supabase", "后端"],
  "clerk.com":            ["Clerk", "认证"],
  "auth0.com":            ["Auth0", "认证"],
  "stripe.com":           ["Stripe", "支付"],
  "cloudflare.com":       ["Cloudflare", "CDN"],
  "aws.amazon.com":       ["AWS", "云计算"],
  "console.aws.amazon.com": ["AWS", "云计算"],
  "learn.microsoft.com":  ["Microsoft", "文档"],
  "go.dev":               ["Go", "文档"],
  "pkg.go.dev":           ["Go", "文档"],
  "spring.io":            ["Spring", "Java"],
  "kotlinlang.org":       ["Kotlin", "文档"],
  "figma.com":            ["Figma", "设计"],
  "dribbble.com":         ["Dribbble", "设计"],
  "ui.dev":               ["前端", "开发"],
  "caniuse.com":          ["前端", "兼容性"],
  "npmtrends.com":        ["npm", "趋势"],
  "opensource.org":       ["开源", "许可"],
  "choosealicense.com":   ["开源", "许可"],
  "leetcode.com":         ["LeetCode", "算法"],
  "geeksforgeeks.org":    ["GeeksforGeeks", "算法"],
  "infoq.com":            ["InfoQ", "技术新闻"],
  "oreilly.com":          ["O'Reilly", "技术图书"],
  "amazon.com":           ["Amazon", "购物"],
  "amazon.cn":            ["亚马逊", "购物"],
  "taobao.com":           ["淘宝", "购物"],
  "jd.com":               ["京东", "购物"],
  "weibo.com":            ["微博", "社交"],
  "douban.com":           ["豆瓣", "社交"],
  "baidu.com":            ["百度", "搜索"],
  "bing.com":             ["Bing", "搜索"],
  "google.com":           ["Google", "搜索"],
  "googleapis.com":       ["Google", "API"],
};

/** 从 DB 设置加载自定义域名映射表（合并到默认映射之上） */
async function loadDomainTagOverrides(): Promise<Record<string, string[]> | null> {
  const raw = await getAppSetting(SETTING_KEYS.domainTagMap);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const result: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (Array.isArray(v)) result[k] = v as string[];
      }
      return Object.keys(result).length > 0 ? result : null;
    }
  } catch { /* ignore invalid JSON */ }
  return null;
}

/** 从 DB 设置加载自定义技术关键词列表（完全替代默认列表） */
async function loadTechKeywordOverrides(): Promise<string[] | null> {
  const raw = await getAppSetting(SETTING_KEYS.techKeywords);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map(String);
    }
  } catch { /* ignore invalid JSON */ }
  return null;
}

function getDomainTags(domain: string, overrides?: Record<string, string[]>): string[] {
  // 先查自定义映射
  if (overrides?.[domain]) return [...overrides[domain]];
  // 再查默认映射
  const exact = DEFAULT_DOMAIN_TAG_MAP[domain];
  if (exact) return [...exact];

  // 子域名匹配：逐级回退
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (overrides?.[candidate]) return [...overrides[candidate]];
    if (DEFAULT_DOMAIN_TAG_MAP[candidate]) return [...DEFAULT_DOMAIN_TAG_MAP[candidate]];
  }

  return [];
}

/** 技术关键词列表（内置缺省值，可在 /settings 中覆盖） */
export const DEFAULT_TECH_KEYWORDS = [
  "React", "Vue", "Nuxt", "Next.js", "Angular", "Svelte", "SolidJS",
  "Node", "Deno", "Bun",
  "TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "Kotlin",
  "Swift", "Ruby", "PHP", "C++", "C#", "Zig",
  "Docker", "Podman", "Kubernetes", "Helm", "Terraform",
  "GPT", "LLM", "OpenAI", "Claude", "AI", "机器学习", "深度学习",
  "RAG", "Agent", "Prompt",
  "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Elasticsearch",
  "GraphQL", "REST", "gRPC", "tRPC",
  "Prisma", "Drizzle", "TypeORM",
  "Tailwind", "CSS", "Sass", "Less", "styled-components",
  "Webpack", "Vite", "Turbopack", "esbuild", "Rollup",
  "Jest", "Vitest", "Cypress", "Playwright",
  "Linux", "Nginx", "Apache", "Git", "CI/CD",
  "AWS", "GCP", "Azure", "Cloudflare", "Vercel", "Netlify",
  "微服务", "架构", "性能优化", "安全",
];

function extractTitleTags(title: string, keywordsOverride?: string[]): string[] {
  const keywords = keywordsOverride ?? DEFAULT_TECH_KEYWORDS;
  const found: string[] = [];
  for (const kw of keywords) {
    if (title.includes(kw)) {
      found.push(kw);
    }
  }
  return found;
}

function ruleBasedTopics(page: PageInput, options?: { domainOverrides?: Record<string, string[]>; keywordOverrides?: string[] }): string[] {
  const tags = new Set<string>();

  // 域名匹配
  getDomainTags(page.domain, options?.domainOverrides).forEach((t) => tags.add(t));

  // 标题关键词
  extractTitleTags(page.title, options?.keywordOverrides).forEach((t) => tags.add(t));

  // 从 URL 路径提取有意义的单词（英文/数字）
  try {
    const url = new URL(page.url);
    const segments = url.pathname.split("/").filter(Boolean);
    for (const seg of segments) {
      // "react-hooks" → "React Hooks"、"react" → "React"
      const clean = seg
        .replace(/\.(html|htm|php|aspx?|jsp)$/i, "")
        .replace(/[_-]/g, " ");
      if (/^[a-zA-Z]/.test(clean) && clean.length > 2 && clean.length < 30) {
        tags.add(clean);
      }
    }
  } catch {
    // ignore invalid URL
  }

  // 限制 5 个
  return [...tags].slice(0, 5);
}

// ───────────────────────── LLM 批量生成 ─────────────────────────

type LlmResult = Record<string, string[]>;

async function llmBatchTopics(
  pages: PageInput[],
): Promise<LlmResult | null> {
  const apiKey = OPENAI_API_KEY();
  const apiBase = OPENAI_API_BASE();
  const modelId = OPENAI_MODEL_ID();
  if (!apiKey || !apiBase || !modelId) return null;

  const pageList = pages
    .slice(0, 20) // 单次最多 20 页
    .map((p, i) => `${i + 1}. [${p.title}](${p.url}) — ${p.domain}`)
    .join("\n");

  const prompt = [
    "以下是用户今天浏览的网页列表。请根据每个网页的标题和域名，判断其核心主题，生成精准的话题标签。",
    "要求：",
    "1. 标签必须抓住文章的核心主题要义，不能只写宽泛的域名级标签（如仅写'新闻'、'博客'），要具体到领域和内容方向",
    "2. 每个网页 1-5 个标签，从核心到细分层次排列",
    "3. 标签风格一致：名词性短语，中文为主，技术名词可用英文（如 React、RAG、Next.js）",
    "4. 如果是同一主题的多个页面（如同一个 GitHub 仓库的不同文件），使用相同标签",
    "5. 好的标签示例：'前端性能优化'、'LLM 推理部署'、'React Server Components'、'Kubernetes 监控'、'RAG 检索增强'。差的标签示例：'技术'、'博客'、'文章'、'网页'",
    "",
    "网页列表：",
    pageList,
    "",
    "请以 JSON 格式返回（只输出 JSON，不要包含其他文字）：",
    `{ "topics": { "<url1>": ["标签1", "标签2"], "<url2>": ["标签1", "标签2", "标签3"] } }`,
    "注意：key 必须使用完整的 url，value 是字符串数组。",
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
            content: await getAppSetting(SETTING_KEYS.tagExtractionSystemPrompt),
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[PWM] LLM topic request failed: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    // 尝试提取 JSON（可能包含 markdown 代码块）
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const parsed = JSON.parse(jsonStr) as { topics?: Record<string, string[]> };

    if (!parsed.topics || typeof parsed.topics !== "object") return null;

    // 过滤：每个 url 最多 5 个标签
    const result: LlmResult = {};
    for (const [url, tags] of Object.entries(parsed.topics)) {
      if (Array.isArray(tags)) {
        result[url] = tags.slice(0, 5);
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    console.error("[PWM] LLM topic generation error:", error);
    return null;
  }
}

// ───────────────────────── 主入口 ─────────────────────────

/**
 * 为一批页面生成话题标签。
 *
 * @param pages  页面列表
 * @param useLlm  是否尝试 LLM（默认 true）
 * @returns Map<url, topics[]>
 */
export async function generateTopicsForPages(
  pages: PageInput[],
  useLlm = true,
): Promise<Map<string, string[]>> {
  if (pages.length === 0) return new Map();

  // 加载外部覆盖配置
  const domainOverrides = await loadDomainTagOverrides();
  const keywordOverrides = await loadTechKeywordOverrides();
  const ruleOptions = (domainOverrides || keywordOverrides)
    ? { domainOverrides: domainOverrides ?? undefined, keywordOverrides: keywordOverrides ?? undefined }
    : undefined;

  const result = new Map<string, string[]>();

  // 1) 优先 LLM 批量生成
  if (useLlm) {
    const llmResult = await llmBatchTopics(pages);
    if (llmResult) {
      for (const p of pages) {
        const topics = llmResult[p.url];
        result.set(p.url, topics?.slice(0, 5) ?? ruleBasedTopics(p, ruleOptions));
      }
      return result;
    }
  }

  // 2) 回退到规则匹配
  for (const p of pages) {
    result.set(p.url, ruleBasedTopics(p, ruleOptions));
  }

  return result;
}
