# AGENTS.md

## 仓库定位（已核实）
- 这是一个 `pnpm` monorepo：
  - `apps/api`：Next.js 16 API + Dashboard
  - `apps/extension`：WXT + React 浏览器扩展
  - `packages/shared`：前后端共享的 Zod schema / TypeScript 类型
- 根脚本只提供最小入口：`dev:api`、`dev:ext`、`build:api`、`build:ext`。

## 先读哪些文件
- 根：`package.json`、`pnpm-workspace.yaml`、`.gitignore`
- API：`apps/api/package.json`、`apps/api/prisma.config.ts`、`apps/api/src/app/api/digest/route.ts`、`apps/api/src/app/page.tsx`
- 扩展：`apps/extension/package.json`、`apps/extension/wxt.config.ts`、`apps/extension/entrypoints/background.ts`、`apps/extension/entrypoints/popup/App.tsx`
- 共享契约：`packages/shared/src/index.ts`

## 精确命令（不要猜）
- 安装依赖：`pnpm install`
- 启动 API：`pnpm dev:api`
- 启动扩展开发：`pnpm dev:ext`
- 构建 API：`pnpm build:api`
- 构建扩展：`pnpm build:ext`
- 扩展额外类型检查：`pnpm -F @pwm/extension compile`
- API lint：`pnpm -F @pwm/api lint`

## 验证顺序
- 改 `apps/api`：至少跑 `pnpm build:api`
- 改 `apps/extension`：至少跑 `pnpm build:ext`
- 改 `packages/shared` 的 schema / type：必须同时跑 `pnpm build:api` 和 `pnpm build:ext`

## 架构要点（高频误判点）
- 扩展不会把原始 page 数据发给后端；原始浏览记录只存在扩展端 Dexie。
- 上传给后端的是 `DailyDigest`，契约定义在 `packages/shared/src/index.ts`。
- 扩展定时上传入口在 `apps/extension/entrypoints/background.ts`：alarm -> `buildDailyDigest()` -> `uploadDigest()`。
- 后端接收入口在 `apps/api/src/app/api/digest/route.ts`：`POST /api/digest` upsert SQLite，`GET /api/digest` 返回摘要列表。
- Dashboard 首页 `apps/api/src/app/page.tsx` 直接读 Prisma，不绕内部 HTTP 请求。
- `summary` 可由后端在 `POST /api/digest` 中自动补全；实现位于 `apps/api/src/lib/summary.ts`。

## 环境与数据源
- API 的 SQLite 路径由 `apps/api/prisma.config.ts` 固定为 `file:./prisma/dev.db`。
- API 运行时需要 `apps/api/.env`；可参考 `apps/api/.env.example`。
- AI 摘要使用 OpenAI 兼容接口，读取：
  - `OPENAI_API_KEY`
  - `OPENAI_API_BASE`
  - `OPENAI_MODEL_ID`

## Prisma 相关约束
- 当前仓库使用 Prisma 7 + `@prisma/adapter-better-sqlite3`，不要退回旧的 `datasourceUrl` 构造方式。
- Prisma client 初始化在 `apps/api/src/lib/prisma.ts`，改数据库接入方式时先读这里。

## 搜索与编辑时的噪音源
- `packages/shared/node_modules` 已进入工作区；搜索时应主动排除 `node_modules`、`.git`、`.omo`，避免误读。
- `.omo/*` 是本地会话/续跑状态文件，不属于产品功能代码；不要把它们混进功能提交。

## 当前没有的东西
- 根目录没有统一的 `test`、`lint`、`typecheck` 聚合脚本。
- 没有 CI 工作流可作为事实来源。
- 没有额外的 `CLAUDE.md`、`.cursorrules`、`opencode.json` 仓库级指令文件。

## 提交习惯（基于当前历史）
- 现有提交风格是语义化前缀 + 简体中文说明，例如：`feat(api): ...`、`feat(extension): ...`。
- 用户已明确要求：**每个 step 完成后单独提交代码**。
