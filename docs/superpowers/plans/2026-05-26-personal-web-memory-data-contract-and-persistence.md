# Personal Web Memory 数据契约与持久化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `personal-web-memory` 建立浏览记录追踪系统的共享数据契约、本地 IndexedDB 持久化骨架、后端 SQLite/Prisma 持久化骨架，并为后续“记录访问 → 聚合每日摘要 → 上传/查询摘要”打好基础。

**Architecture:** 本项目采用 pnpm monorepo：`apps/extension` 是 WXT + React 浏览器扩展，负责采集与本地存储 `PageRecord`；`apps/api` 是 Next.js API，负责接收和查询 `DailyDigest`；`packages/shared` 是跨端契约包，以 Zod schema 作为类型单一真源。扩展端原始访问记录只保存在本地 IndexedDB，后端只保存每日聚合摘要，不保存原始浏览明细。

**Tech Stack:** pnpm workspace、Node >= 20.19.0、TypeScript、WXT、React、Next.js、Zod、Dexie、Prisma、SQLite。

---

## 1. 已确认的产品与数据决策

### 1.1 系统边界

本阶段只做“数据契约与持久化骨架”。不实现浏览器监听、不实现聚合任务、不实现 API route、不实现 UI 展示。

最终系统拆分为三层：

1. **扩展端采集层**：在浏览器扩展里记录用户访问页面，写入 IndexedDB。
2. **扩展端聚合层**：后续按日把 `PageRecord[]` 聚合成 `DailyDigest`。
3. **后端摘要层**：Next.js API 接收/查询每日摘要，SQLite 只保存摘要，不保存原始页面访问记录。

### 1.2 `PageRecord` 最终 schema

`PageRecord` 是扩展端 IndexedDB `pages` 表的一行。

字段：

```ts
type PageRecord = {
  id?: number;
  url: string;
  title: string;
  domain: string;
  visitedAt: number;
  durationMs?: number;
  favicon?: string;
};
```

字段语义：

- `id`：Dexie 自增主键，写入时可省略。
- `url`：完整 URL。
- `title`：页面标题。
- `domain`：仅主机名，用于后续聚合，例如 `github.com`。
- `visitedAt`：进入页面时间，毫秒 epoch。
- `durationMs`：活跃浏览时长，毫秒。页面未离开或未结算时允许为空。
- `favicon`：页面图标，允许为空。

记录策略：

- **多次访问同一 URL 必须写多行**。
- 不按 URL 去重。
- 同 URL 不同 `visitedAt` 各占一行。

### 1.3 `durationMs` 最终口径

采用 **活跃时长口径**：

- 只有页面处于 `visibility = visible` 或等价活跃状态时才累计。
- 切走、最小化、后台不可见时暂停计时。
- 离开页面、标签关闭、导航跳转时回填或最终结算 `durationMs`。

原因：

- 比“打开到关闭”的停留时长更接近真实阅读/使用时间。
- 后续 `totalDurationMs` 和 `topDomains.durationMs` 更有分析价值。

### 1.4 `DailyDigest` 最终 schema

`DailyDigest` 是每日汇总摘要，也是扩展端上传 payload 与后端 SQLite 的核心数据。

业务层形态：

```ts
type DomainStat = {
  domain: string;
  count: number;
  durationMs: number;
};

type DailyDigest = {
  date: string;
  summary: string;
  pageCount: number;
  totalDurationMs: number;
  topDomains: DomainStat[];
};
```

字段语义：

- `date`：`YYYY-MM-DD`，业务唯一。
- `summary`：Markdown 文本摘要。
- `pageCount`：当日页面访问总条数，含重复访问，等于当日 `pages` 行数。
- `totalDurationMs`：当日所有 `PageRecord.durationMs` 求和，未结算/空值按 0 处理。
- `topDomains`：按业务规则排序后的域名统计数组。
- `topDomains[].domain`：域名。
- `topDomains[].count`：当日该域名访问次数，含重复。
- `topDomains[].durationMs`：当日该域名活跃时长累计。

后端 SQLite 存储形态：

- `date` 用 `String @unique`。
- `topDomains` 暂以 JSON 字符串保存。
- `createdAt`、`updatedAt` 由 Prisma 维护。
- 后端不保存 `PageRecord` 原始数据。

### 1.5 `Settings` 最终 schema

扩展端本地配置表 `settings` 采用单行配置。

```ts
type Settings = {
  id: "singleton";
  apiBaseUrl?: string;
  enabled: boolean;
  lastUploadedDate?: string;
};
```

字段语义：

- `id`：固定为 `singleton`，作为单行配置主键。
- `apiBaseUrl`：后端 API 基地址，例如 `http://localhost:3000`。
- `enabled`：是否启用上报，默认 `true`。
- `lastUploadedDate`：上次成功上传的日期，格式 `YYYY-MM-DD`。

### 1.6 API 契约

本阶段只定义契约，不实现 route。

计划 API：

1. `POST /api/digest`
   - 请求体：`DailyDigest`
   - 响应体：`{ ok: true, date: string }`
2. `GET /api/digest`
   - 响应体：`{ items: Array<DailyDigest & { createdAt: string; updatedAt: string }> }`

---

## 2. 已核实的仓库事实

### 2.1 根目录

仓库根目录：`F:\devAI\app\personal-web-memory`

已存在文件/目录：

- `AGENTS.md`
- `apps/`
- `packages/`
- `node_modules/`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`（本轮已创建）
- `.gitignore`

根 `package.json`：

```json
{
  "name": "personal-web-memory",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20.19.0"
  },
  "scripts": {
    "dev:ext": "pnpm -F @pwm/extension dev",
    "dev:api": "pnpm -F @pwm/api dev",
    "build:ext": "pnpm -F @pwm/extension build",
    "build:api": "pnpm -F @pwm/api build"
  }
}
```

`pnpm-workspace.yaml`：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 2.2 `apps/extension`

技术栈：WXT + React。

包名：`@pwm/extension`

关键脚本：

```json
{
  "dev": "wxt",
  "build": "wxt build",
  "compile": "tsc --noEmit",
  "postinstall": "wxt prepare"
}
```

本轮已安装依赖：

- `dexie@^4.4.2`

### 2.3 `apps/api`

技术栈：Next.js。

包名：`@pwm/api`

关键脚本：

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint"
}
```

本轮已安装依赖：

- `@prisma/client@^7.8.0`
- `prisma@^7.8.0`

### 2.4 `packages/shared`

包名：`@pwm/shared`

本轮已创建。

本轮已安装依赖：

- `zod@^3.25.76`

---

## 3. 已经执行过的实现动作

以下动作已经发生，后续执行者不要重复盲目覆盖，应先读取文件确认。

### 3.1 已创建目录

- `packages/shared/src`
- `apps/api/src/lib`
- `apps/api/prisma`
- `apps/extension/src/lib`
- `docs/superpowers/plans`

### 3.2 已创建 `tsconfig.base.json`

路径：`tsconfig.base.json`

当前内容：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@pwm/shared": ["packages/shared/src/index.ts"],
      "@pwm/shared/*": ["packages/shared/src/*"]
    }
  }
}
```

注意：当前 `apps/extension/tsconfig.json` 和 `apps/api/tsconfig.json` 没有直接 `extends` 这个 base，而是在各自 tsconfig 内显式写入了 `@pwm/shared` paths。后续如要统一继承，需要小心保留 WXT 与 Next.js 原有配置。

### 3.3 已创建 `packages/shared/package.json`

路径：`packages/shared/package.json`

当前内容：

```json
{
  "name": "@pwm/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "zod": "^3.25.76"
  }
}
```

### 3.4 已创建 `packages/shared/tsconfig.json`

路径：`packages/shared/tsconfig.json`

当前内容：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"]
}
```

### 3.5 已创建 `packages/shared/src/index.ts`

职责：跨端共享 Zod schema 与派生 TypeScript 类型。

当前定义包括：

- `dateStringSchema`
- `pageRecordSchema` / `PageRecord`
- `domainStatSchema` / `DomainStat`
- `dailyDigestSchema` / `DailyDigest`
- `settingsSchema` / `Settings`
- `uploadDigestRequestSchema` / `UploadDigestRequest`
- `uploadDigestResponseSchema` / `UploadDigestResponse`
- `getDigestsResponseSchema` / `GetDigestsResponse`

关键代码：

```ts
import { z } from "zod";

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const pageRecordSchema = z.object({
  id: z.number().int().positive().optional(),
  url: z.string().url(),
  title: z.string(),
  domain: z.string().min(1),
  visitedAt: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().optional(),
  favicon: z.string().optional(),
});
export type PageRecord = z.infer<typeof pageRecordSchema>;

export const domainStatSchema = z.object({
  domain: z.string().min(1),
  count: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});
export type DomainStat = z.infer<typeof domainStatSchema>;

export const dailyDigestSchema = z.object({
  date: dateStringSchema,
  summary: z.string(),
  pageCount: z.number().int().nonnegative(),
  totalDurationMs: z.number().int().nonnegative(),
  topDomains: z.array(domainStatSchema),
});
export type DailyDigest = z.infer<typeof dailyDigestSchema>;

export const settingsSchema = z.object({
  id: z.literal("singleton"),
  apiBaseUrl: z.string().url().optional(),
  enabled: z.boolean().default(true),
  lastUploadedDate: dateStringSchema.optional(),
});
export type Settings = z.infer<typeof settingsSchema>;
```

### 3.6 已创建扩展端 Dexie DB

路径：`apps/extension/src/lib/db.ts`

职责：声明 IndexedDB schema，不写业务数据。

当前表：

- `pages`: `++id, visitedAt, domain`
- `digests`: `date`
- `settings`: `id`

当前代码：

```ts
import Dexie, { type Table } from "dexie";
import type { DailyDigest, PageRecord, Settings } from "@pwm/shared";

export class PwmDB extends Dexie {
  pages!: Table<PageRecord, number>;
  digests!: Table<DailyDigest, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("pwm");
    this.version(1).stores({
      pages: "++id, visitedAt, domain",
      digests: "date",
      settings: "id",
    });
  }
}

export const db = new PwmDB();
```

### 3.7 已创建 Prisma schema

路径：`apps/api/prisma/schema.prisma`

职责：声明后端 SQLite `DailyDigest` 表。

当前代码：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model DailyDigest {
  id              Int      @id @default(autoincrement())
  date            String   @unique
  summary         String
  pageCount       Int
  totalDurationMs Int
  topDomains      String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([date])
}
```

### 3.8 已创建 PrismaClient 单例

路径：`apps/api/src/lib/prisma.ts`

当前代码：

```ts
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __pwmPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__pwmPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__pwmPrisma = prisma;
}
```

### 3.9 已修改扩展端 tsconfig

路径：`apps/extension/tsconfig.json`

当前内容：

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@pwm/shared": ["../../packages/shared/src/index.ts"],
      "@pwm/shared/*": ["../../packages/shared/src/*"]
    }
  }
}
```

### 3.10 已修改 API tsconfig

路径：`apps/api/tsconfig.json`

当前 paths：

```json
"paths": {
  "@/*": ["./src/*"],
  "@pwm/shared": ["../../packages/shared/src/index.ts"],
  "@pwm/shared/*": ["../../packages/shared/src/*"]
}
```

### 3.11 已修改 `.gitignore`

新增：

```gitignore
# Prisma 本地 sqlite 数据库
apps/api/prisma/dev.db
apps/api/prisma/dev.db-journal
```

### 3.12 已执行依赖安装命令

已执行：

```bash
pnpm -F @pwm/shared add zod
pnpm -F @pwm/extension add dexie
pnpm -F @pwm/api add @prisma/client
pnpm -F @pwm/api add -D prisma
```

已观察到：

- `@pwm/shared` 的 `zod` 最终为 `^3.25.76`。
- `@pwm/extension` 的 `dexie` 最终为 `^4.4.2`。
- `@pwm/api` 的 `@prisma/client` 和 `prisma` 最终为 `^7.8.0`。
- `pnpm-lock.yaml` 已被安装命令更新。
- `apps/extension postinstall` 已运行 `wxt prepare` 并成功生成类型。

---

## 4. 尚未完成的工作

### 4.1 尚未执行 Prisma migrate

需要执行：

```bash
pnpm -F @pwm/api exec prisma migrate dev --name init
```

预期：

- 生成 `apps/api/prisma/dev.db`。
- 生成 `apps/api/prisma/migrations/<timestamp>_init/migration.sql`。
- Prisma Client 可正常生成。

注意：

- `dev.db` 已加入 `.gitignore`，不应提交。
- `migrations` 应提交。

### 4.2 尚未执行验证

需要执行：

```bash
pnpm -F @pwm/extension compile
pnpm -F @pwm/api exec tsc --noEmit
```

预期：两个命令均 0 error。

### 4.3 可能需要修正 Prisma 7 配置差异

当前 `apps/api/prisma/schema.prisma` 使用传统写法：

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

事实：已安装 Prisma `^7.8.0`。如果 migrate 报错提示 datasource URL 配置方式变化，应按 Prisma 7 的实际错误信息修正，而不是猜测。修正后必须更新本计划或补充实施记录。

### 4.4 API route 仍未实现

本阶段没有实现以下文件：

- `apps/api/src/app/api/digest/route.ts`

后续实现该 route 时必须：

- 用 `uploadDigestRequestSchema.safeParse()` 校验 POST body。
- `topDomains` 入库前 `JSON.stringify()`。
- 从 DB 读取后对 `topDomains` `JSON.parse()`，再用 `dailyDigestSchema` 或响应 schema 校验。
- 按 `date` 做 upsert，避免重复上传失败。

### 4.5 浏览器采集逻辑仍未实现

本阶段没有实现：

- tab 激活监听
- URL 变化监听
- visibility 计时逻辑
- duration 回填逻辑
- 每日聚合逻辑
- 上传逻辑
- UI 展示

---

## 5. 文件责任边界

### `packages/shared/src/index.ts`

唯一职责：跨端数据契约。

规则：

- Zod schema 是单一真源。
- TypeScript 类型必须用 `z.infer` 派生。
- 不放浏览器 API、Prisma、Dexie 逻辑。

### `apps/extension/src/lib/db.ts`

唯一职责：Dexie DB schema 与 DB 实例。

规则：

- 不放采集业务逻辑。
- 不放聚合逻辑。
- 不直接访问后端 API。

### `apps/api/prisma/schema.prisma`

唯一职责：后端数据库结构。

规则：

- 只建 `DailyDigest`。
- 不建原始 `PageRecord` 表。
- `topDomains` 当前以 JSON string 存储。

### `apps/api/src/lib/prisma.ts`

唯一职责：导出 PrismaClient 单例。

规则：

- 避免 Next.js dev 热重载重复创建 PrismaClient。
- API route 统一从这里 import `prisma`。

### `apps/api/src/app/api/digest/route.ts`（后续创建）

唯一职责：DailyDigest 的 HTTP API。

规则：

- POST 接收摘要。
- GET 查询摘要。
- 所有请求/响应必须经过 shared schema 校验。

---

## 6. 下一步执行计划

### Task 1: 完成 Prisma migrate

**Files:**

- Read: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_init/migration.sql`
- Generated ignored file: `apps/api/prisma/dev.db`

- [ ] **Step 1: 执行 migrate**

```bash
pnpm -F @pwm/api exec prisma migrate dev --name init
```

Expected:

- 命令退出码为 0。
- 生成 SQLite 数据库 `apps/api/prisma/dev.db`。
- 生成 migrations 目录。
- 生成 Prisma Client。

- [ ] **Step 2: 如果 Prisma 7 报 datasource URL 配置错误，按错误信息最小修正**

只允许基于命令输出修正，不允许凭空猜测。修正后重新运行：

```bash
pnpm -F @pwm/api exec prisma migrate dev --name init
```

Expected:

- 命令退出码为 0。

### Task 2: 验证扩展端 TypeScript

**Files:**

- Read: `apps/extension/tsconfig.json`
- Read: `apps/extension/src/lib/db.ts`
- Read: `packages/shared/src/index.ts`

- [ ] **Step 1: 运行扩展端 compile**

```bash
pnpm -F @pwm/extension compile
```

Expected:

- 退出码 0。
- `@pwm/shared` import 可解析。
- Dexie 表类型无 TypeScript 错误。

- [ ] **Step 2: 如失败，仅按错误信息修正**

常见可能失败点：

- WXT tsconfig 与 paths 冲突。
- shared 包 TS 文件跨 package import 解析失败。
- Dexie `Table<DailyDigest, string>` 与主键声明不匹配。

修正原则：

- 优先最小修改 tsconfig paths。
- 不把 shared 代码复制进 extension。
- 不移除 Zod schema。

### Task 3: 验证 API TypeScript

**Files:**

- Read: `apps/api/tsconfig.json`
- Read: `apps/api/src/lib/prisma.ts`
- Read: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: 运行 API tsc**

```bash
pnpm -F @pwm/api exec tsc --noEmit
```

Expected:

- 退出码 0。
- `@prisma/client` import 可解析。
- `PrismaClient` 类型存在。

- [ ] **Step 2: 如失败，仅按错误信息修正**

常见可能失败点：

- Prisma Client 未生成。
- Prisma 7 生成方式不同。
- Next.js tsconfig 与 shared paths 冲突。

修正原则：

- 先确认 Prisma generate/migrate 是否成功。
- 不绕开类型检查。
- 不关闭 strict。

### Task 4: 记录验证结果

**Files:**

- Modify: `docs/superpowers/plans/2026-05-26-personal-web-memory-data-contract-and-persistence.md`

- [ ] **Step 1: 在本计划末尾追加执行结果**

追加格式：

```md
## 8. 执行结果记录

执行时间：2026-05-26，Windows + pnpm workspace。

- `pnpm -F @pwm/api exec prisma migrate dev --name init`: **PASS**。关键输出：生成迁移目录 `apps/api/prisma/migrations/20260526092253_init/migration.sql`，创建 `apps/api/prisma/dev.db`，`prisma generate` 同步成功，Prisma Client 可解析 `DailyDigest` 模型。
- `pnpm -F @pwm/extension compile`: **PASS**。命令等价于 `tsc --noEmit`，退出码 0，无类型诊断输出。
- `pnpm -F @pwm/api exec tsc --noEmit`: **PASS**。退出码 0，无输出，shared schema 与 Prisma Client 类型在 API 包内可解析。

结论：本阶段（Step 1 + Step 2）数据契约层与持久化骨架已落地并通过类型与迁移自检，可作为后续 Step 3-6 的稳定起点。
```

Expected:

- 后续任何 agent 都能从计划文档恢复现场。

---

## 7. 后续阶段建议

### Step 3: 扩展端采集与活跃计时

目标：把真实浏览行为写入 `pages` 表。

关键点：

- 监听 tab 激活、URL 变化、tab 关闭。
- 以 `visibility` 或扩展可获得的等价信号控制活跃计时。
- 页面开始访问时创建 `PageRecord`。
- 页面离开时回填 `durationMs`。
- 重复访问同 URL 创建新行。

### Step 4: 每日聚合

目标：把某天 `PageRecord[]` 聚合成 `DailyDigest`。

聚合规则：

- `pageCount = 当日 PageRecord 行数`。
- `totalDurationMs = sum(durationMs ?? 0)`。
- `topDomains[].count = groupBy(domain).length`。
- `topDomains[].durationMs = groupBy(domain).sum(durationMs ?? 0)`。

### Step 5: API route

目标：实现 `POST /api/digest` 和 `GET /api/digest`。

关键点：

- 使用 shared schema 做请求响应校验。
- POST 使用 `date` upsert。
- `topDomains` 业务层为数组，DB 层为 JSON 字符串。

### Step 6: UI 展示

目标：扩展端或 Web 端展示每日摘要、访问次数、总时长、Top domains。

---

## 8. 计划自检

### 8.1 Spec 覆盖

已覆盖：

- `PageRecord` 字段与重复访问策略。
- `durationMs` 活跃时长口径。
- `DailyDigest` 字段与 topDomains 计数/时长双指标。
- `Settings` 单行配置。
- 扩展端 Dexie 三表。
- 后端 Prisma SQLite DailyDigest 表。
- API 契约。
- 当前已经执行过的文件创建、修改、依赖安装。
- 尚未完成的 migrate 与验证命令。

### 8.2 Placeholder 扫描

本计划没有使用未定义任务占位。后续阶段只作为“建议”，不属于本阶段必须完成范围。

### 8.3 类型一致性

一致性检查：

- `DailyDigest.topDomains` 在 shared 中是 `DomainStat[]`。
- Prisma `DailyDigest.topDomains` 是 `String`，计划明确要求 JSON stringify/parse。
- Dexie `digests` 表主键是 `date`，对应 `DailyDigest.date: string`。
- Dexie `settings` 表主键是 `id`，对应 `Settings.id: "singleton"`。
- API 请求响应类型均由 shared schema 派生。
