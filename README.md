# Personal Web Memory

一句话说明：Personal Web Memory 是一个面向希望沉淀日常浏览与学习轨迹的个人用户的浏览记忆系统，通过 **WXT 扩展采集本地浏览行为、按日聚合为 Daily Digest、再由 Next.js + Prisma + SQLite Dashboard 展示并可选生成 AI 摘要**，帮助用户把碎片化网页访问转成可回顾的个人知识记录。

## Architecture

- `apps/extension`：浏览器扩展，负责记录标签页切换、页面停留时长、本地聚合与上传。
- `apps/api`：Next.js API 与 Dashboard，负责接收摘要、落库、展示统计、生成服务端摘要。
- `packages/shared`：共享数据契约，统一 `DailyDigest`、`Settings`、API request/response schema。

## Features

- 自动记录活跃浏览时长，而不是仅记录打开过的页面
- 按日聚合为 `DailyDigest`，包含页面数、总时长、Top Domains
- 扩展端本地存储原始数据，后端只接收摘要
- Dashboard 展示最近 30 天的 Digest、摘要与统计
- 支持 OpenAI 兼容接口生成每日 AI 总结
- Popup 设置页支持上传开关与 API 基地址配置

## Installation（安装）

```bash
pnpm install
```

Node 要求：`>=20.19.0`

API 环境变量可参考：`apps/api/.env.example`

## Quick Start（最关键）

1. 安装依赖

```bash
pnpm install
```

2. 配置 API 环境变量

```bash
copy apps\api\.env.example apps\api\.env
```

3. 启动 API

```bash
pnpm dev:api
```

4. 启动扩展开发

```bash
pnpm dev:ext
```

5. 在浏览器加载 WXT 输出的扩展，开始浏览并等待 alarm 聚合上传

6. 打开 Dashboard 查看结果（默认 Next.js 本地地址）

## Examples（案例）

- **学习记录**：追踪一天内阅读了哪些技术文档、在哪些域名停留最久
- **研发复盘**：把 OAuth、RAG、Next.js 等分散浏览轨迹汇总成每日工作摘要
- **个人知识归档**：用 Dashboard 回看最近 30 天的关注主题变化

## Contributing（开源必备）

欢迎提交 Issue 和 PR。

建议本地提交流程：

```bash
pnpm build:api
pnpm build:ext
```

如果修改了 `packages/shared`，请同时验证 API 和扩展两端构建。

## License

当前仓库尚未添加独立 License 文件；在开源发布前请补充明确许可证。
