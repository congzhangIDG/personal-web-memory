
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
- 时间线 + 主题 + 收藏 三页签切换，左侧导航快速跳转
- 支持 OpenAI 兼容接口生成每日 AI 总结，降级为规则生成不报错
- 内建域名标签映射和技术关键词列表，AI 不可用时按规则自动打标签
- **系统设置页面**（`/settings`）可自定义 AI 系统提示词、域名标签映射表、技术关键词列表
- 支持手动重新生成单日摘要、批量回填所有日总结
- 支持删除单条浏览记录、收藏/取消收藏
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

本地开发调试
```bash
pnpm dev:ext
```

本地打包(通过浏览器扩展加载插件)
```bash
pnpm build:ext
```

5. 在浏览器加载 WXT 输出的扩展，开始浏览并等待 alarm 聚合上传

6. 打开 Dashboard 查看结果（默认 Next.js 本地地址）

## Examples（案例）

- **学习记录**：追踪一天内阅读了哪些技术文档、在哪些域名停留最久
- **研发复盘**：把 OAuth、RAG、Next.js 等分散浏览轨迹汇总成每日工作摘要
- **个人知识归档**：用 Dashboard 回看最近 30 天的关注主题变化

<img width="1441" height="885" alt="image" src="https://github.com/user-attachments/assets/46fc185e-70fd-4cd2-a6a8-7e70d54f24b1" />
<img width="1427" height="798" alt="image" src="https://github.com/user-attachments/assets/d3bc9504-1578-4b67-8772-479506c5e23e" />

<img width="1283" height="763" alt="image" src="https://github.com/user-attachments/assets/9378005d-1265-4c14-857b-2d9945c47dd2" />
<img width="1434" height="711" alt="image" src="https://github.com/user-attachments/assets/597ef27d-36cd-46e0-b735-e74cd780e0d0" />

<img width="387" height="602" alt="image" src="https://github.com/user-attachments/assets/18616572-ca2d-406e-a2ae-f2713b90c596" />
<img width="370" height="590" alt="image" src="https://github.com/user-attachments/assets/95c147cd-54d8-4d89-876f-dcb30fa9c171" />

## 近期新增功能

- **系统设置页面**（`/settings`）：可自定义 4 条 AI 系统提示词（网页摘要、日总结、分组摘要、标签提取），以及域名标签映射表和技术关键词列表（覆盖内置缺省值）
- **页面删除**：时间线/收藏页签中可单条移除浏览记录
- **日总结重新生成**：每篇 Digest 卡片上的按钮，调用 AI 重新生成当前日期的摘要
- **批量回填**：`POST /api/pages/backfill-summary` 批量回填空摘要页面 + 重新生成所有日总结
- **收藏切换**：页面卡片星级收藏 / 取消收藏
- **主题页签**：按话题筛选并聚合展示页面
- **时间线左侧导航**：日期锚点快速跳转，当前日期高亮

## 隐私与安全

- **数据完全本地化**：所有浏览记录存储在扩展端的 IndexedDB（Dexie），后端使用 SQLite 本地文件数据库，不依赖任何云端存储服务，数据始终留在你自己的设备上。
- **LLM 自由选择**：AI 摘要功能兼容任何 OpenAI 格式的接口，你可以接入：
  - 公司内部部署的私有模型
  - 本地运行的 [Ollama](https://ollama.com/) 模型（如 Llama、Qwen、Mistral 等）
  - 任意第三方 OpenAI 兼容服务
- **无 AI 也能用**：未配置 LLM 时，系统自动降级为规则生成摘要和标签，功能完整可用，不会报错。
- **无遥测、无追踪**：项目不包含任何数据上报、分析埋点或第三方追踪代码。

## Contributing

欢迎提交 Issue 和 PR。

建议本地提交流程：

```bash
pnpm build:api
pnpm build:ext
```

如果修改了 `packages/shared`，请同时验证 API 和扩展两端构建。

## License

MIT License — 详见 [LICENSE](./LICENSE)。
