// @pwm/shared: 跨端共享的 Zod schema 与派生类型
// 设计原则：所有类型由 Zod 派生，单一来源；前后端共用同一份契约。

import { z } from "zod";

// ---------- 基础工具 ----------

/** YYYY-MM-DD 严格校验 */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

// ---------- PageRecord（扩展端 IndexedDB 表 pages） ----------
//
// 每次访问独立一行（不去重）。
// 时长口径：活跃时长（visibility = visible 才计时），离开时由后台脚本回填。

export const pageRecordSchema = z.object({
  /** Dexie 自增主键，写入时省略 */
  id: z.number().int().positive().optional(),
  url: z.string().url(),
  title: z.string(),
  /** 仅主机名，便于聚合，例如 "github.com" */
  domain: z.string().min(1),
  /** 进入页面的时间戳（ms epoch） */
  visitedAt: z.number().int().nonnegative(),
  /** 活跃时长（ms），离开页面前未结算时为 undefined */
  durationMs: z.number().int().nonnegative().optional(),
  favicon: z.string().optional(),
});
export type PageRecord = z.infer<typeof pageRecordSchema>;

// ---------- DailyDigest 内的 Domain 聚合项 ----------

export const domainStatSchema = z.object({
  domain: z.string().min(1),
  /** 当日该 domain 访问次数（含重复） */
  count: z.number().int().nonnegative(),
  /** 当日该 domain 活跃时长累计（ms） */
  durationMs: z.number().int().nonnegative(),
});
export type DomainStat = z.infer<typeof domainStatSchema>;

// ---------- PageVisit（后端存储的单条页面访问记录） ----------

export const pageVisitSchema = z.object({
  id: z.number().int().positive().optional(),
  url: z.string().url(),
  title: z.string(),
  domain: z.string().min(1),
  visitedAt: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().default(0),
  summary: z.string().default(""),
  topics: z.array(z.string()).default([]),
  favorited: z.boolean().default(false),
  date: dateStringSchema,
});
export type PageVisit = z.infer<typeof pageVisitSchema>;

// ---------- DailyDigest（后端 SQLite 表 + 上传 payload 核心） ----------
//
// 注意：DB 内 topDomains 存为 JSON 字符串；网络/内存层用 DomainStat[]。
// 这里的 schema 表示业务层形态；落库时由 API 层做 JSON.stringify。

export const dailyDigestSchema = z.object({
  /** YYYY-MM-DD，唯一 */
  date: dateStringSchema,
  /** Markdown 文本摘要 */
  summary: z.string(),
  /** 当日访问总条数（含重复，等于 pages 行数） */
  pageCount: z.number().int().nonnegative(),
  /** 当日所有 page 活跃时长之和（ms），便于前端直接展示 */
  totalDurationMs: z.number().int().nonnegative(),
  /** 按业务规则排序后的 domain 聚合（不强制顺序，由生成方决定） */
  topDomains: z.array(domainStatSchema),
  /** 主题标签列表，如 ["前端开发","AI"] */
  topics: z.array(z.string()).default([]),
  /** 是否收藏 */
  favorited: z.boolean().default(false),
});
export type DailyDigest = z.infer<typeof dailyDigestSchema>;

// ---------- Settings（扩展端 IndexedDB 表 settings） ----------

export const settingsSchema = z.object({
  /** 固定主键，单行配置 */
  id: z.literal("singleton"),
  /** API 基地址，例如 http://localhost:3000 */
  apiBaseUrl: z.string().url().optional(),
  /** 是否启用上报 */
  enabled: z.boolean().default(true),
  /** 上次成功上传的日期（YYYY-MM-DD） */
  lastUploadedDate: dateStringSchema.optional(),

  // ---- 黑名单 ----
  // blacklist: 域名或 URL 通配符模式列表
  blacklist: z.array(z.string()).optional(),

  // ---- 偏好 ----
  /** 上传间隔（分钟），默认 5 */
  uploadIntervalMin: z.number().int().positive().optional(),
  /** 最小记录时长（秒），低于此值不入库，默认 5 */
  minDurationSec: z.number().int().nonnegative().optional(),
  /** 是否记录隐身标签页，默认 false */
  recordIncognito: z.boolean().optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

// ---------- API 契约 ----------

/** POST /api/digest 请求体 */
export const uploadDigestRequestSchema = dailyDigestSchema.extend({
  pages: z.array(pageVisitSchema.omit({ id: true, date: true })).optional(),
});
export type UploadDigestRequest = z.infer<typeof uploadDigestRequestSchema>;

/** POST /api/digest 响应体 */
export const uploadDigestResponseSchema = z.object({
  ok: z.literal(true),
  date: dateStringSchema,
  pagesUpserted: z.number().optional(),
  message: z.string().optional(),
});
export type UploadDigestResponse = z.infer<typeof uploadDigestResponseSchema>;

/** GET /api/digest 响应体 */
export const getDigestsResponseSchema = z.object({
  items: z.array(
    dailyDigestSchema.extend({
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});
export type GetDigestsResponse = z.infer<typeof getDigestsResponseSchema>;
