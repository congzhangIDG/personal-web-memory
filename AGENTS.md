# AGENTS.md

## 仓库定位（已核实）
- pnpm monorepo：
  - `apps/api`：Next.js 16 API + Dashboard
  - `apps/extension`：WXT + React 浏览器扩展
  - `packages/shared`：前后端共享的 Zod schema / TypeScript 类型
- 根脚本只提供最小入口：`dev:api`、`dev:ext`、`build:api`、`build:ext`。
- 无根级 `test` / `lint` / `typecheck` 聚合脚本，无 CI 工作流。

## 精确命令
- 安装依赖：`pnpm install`
- 启动 API：`pnpm dev:api`（默认 `localhost:3000`）
- 启动扩展开发：`pnpm dev:ext`（浏览器手动加载 WXT 输出）
- 构建 API：`pnpm build:api`
- 构建扩展：`pnpm build:ext`
- 扩展额外类型检查：`pnpm -F @pwm/extension compile`

## 验证顺序
- 改 `apps/api` → 至少跑 `pnpm build:api`
- 改 `apps/extension` → 至少跑 `pnpm build:ext`
- 改 `packages/shared` → 同时跑 `pnpm build:api` + `pnpm build:ext`

## API 路由总览
| 路径 | 方法 | 用途 |
|------|------|------|
| `/api/digest` | POST | 扩展上传 DailyDigest（upsert + AI 摘要补全） |
| `/api/digest` | GET | 返回所有摘要列表 |
| `/api/digest/regenerate` | POST | 重新生成指定日期的 AI 摘要（body: `{date}`） |
| `/api/pages/[id]` | DELETE | 删除单条页面记录 |
| `/api/pages/[id]` | PATCH | 更新收藏/主题（body: `{favorited?, topics?}`） |
| `/api/pages/[id]/favorite` | PATCH | 切换收藏状态（基于当前状态取反） |
| `/api/pages/backfill-summary` | POST | 批量回填空摘要的页面 + 重新生成所有日总结 |
| `/api/settings` | GET | 返回所有可配置项（含 value + defaultValue） |
| `/api/settings` | PUT | 批量保存设置（body: `{items: [{key, value}]}`） |

## 架构要点（高频误判点）
- 扩展端用 **Dexie** 本地存储原始浏览记录，**不**把原始页面数据直接发给后端。
- 上传给后端的是 `DailyDigest`（聚合摘要），契约定义在 `packages/shared/src/index.ts`。
- 扩展定时上传入口：`background.ts` → `buildDailyDigest()` → `uploadDigest()`。
- Dashboard 首页 `page.tsx` 直接读 Prisma，不绕内部 HTTP 请求。
- `lib/topics.ts` 的标签生成策略：**LLM 批量优先**（有 OPENAI_API_KEY 时）→ **规则回退**（域名映射 + 标题关键词匹配）。
- `lib/summary.ts` 的摘要生成策略：**OpenAI 兼容接口** → **规则兜底摘要**。
- 域名映射表（`DEFAULT_DOMAIN_TAG_MAP`）和技术关键词列表（`DEFAULT_TECH_KEYWORDS`）是内置缺省值，可在 `/settings` 页面用 DB 配置覆盖。代码运行时读取 DB 值（`getAppSetting`）合并/替代默认列表。
- 设置项的系统提示词在 AI 调用时作为 `system` 参数传入，修改后**下次生成时生效**，无需重启服务。
- DB 设置项有 1 分钟内存缓存（`settings.ts`），`updateAppSettings()` 写入后自动清缓存。

## DB / Prisma 约束
- **Prisma 7** + `@prisma/adapter-better-sqlite3`，不要退回旧的 `datasourceUrl` 构造方式。
- Prisma client 初始化在 `apps/api/src/lib/prisma.ts`。
- SQLite 路径固定为 `file:./prisma/dev.db`（`prisma.config.ts`）。
- 三个模型：`DailyDigest`（每日聚合）、`PageVisit`（单页面记录）、`AppSetting`（键值设置）。
- 运行前确保有 `.env`（参考 `.env.example`）。

## 环境变量（AI 摘要用）
- `OPENAI_API_KEY`、`OPENAI_API_BASE`、`OPENAI_MODEL_ID`
- 无这些变量时，摘要/标签降级为规则生成，不报错。

## 提交习惯
- 语义化前缀 + 简体中文：`feat(api): ...`、`feat(extension): ...`
- 每个 step 完成后单独提交代码。

## 扩展端 durationMs 计时机制

### 内存模型（tracker.ts）
```
TrackedTab { recordId: number, activeStart: number|null, accumulatedMs: number }
```
- `startTracking()`：创建 Dexie PageRecord（durationMs=undefined），在内存 Map 注册 TrackedTab
- `resumeTimer()`：`activeStart = Date.now()`（tab 获得焦点）
- `pauseTimer()`：`accumulatedMs += now - activeStart; activeStart = null`（tab 失焦）
- `stopTracking()`：最终结算 `totalMs = accumulatedMs + (activeStart ? now - activeStart : 0)`，写入 Dexie，从 Map 删除
- `flushAll()`：对所有正在追踪的 tab 快照当前累计值写入 Dexie，**不终止追踪**（重置 activeStart 为 now）

### 聚合上传流程（background.ts → aggregator.ts）
1. `flushAll()` — 确保活跃 tab 的 durationMs 已写入 Dexie
2. `buildDailyDigest(dateStr)` — 从 Dexie 查询当天所有 PageRecord
3. **按 URL 去重**：同一 URL 多条记录 → 累加各条的 durationMs → 得到该 URL 当天**总停留时长快照**
4. 组装 `DailyDigest`（含 pages 数组）上传后端

### 后端写入语义（route.ts）
扩展每次上传的 `durationMs` 是 **当天该 URL 的累计总时长快照**（非增量），因此后端 upsert 时必须用 **覆盖赋值**（`durationMs: p.durationMs`），而**不能**用 `{ increment: p.durationMs }`，否则多次上传会导致时长翻倍。

## 搜索与噪音源
- 搜索时主动排除 `node_modules`、`.git`、`.omo`
- `.omo/*` 是本地会话状态文件，不要混入功能提交。
