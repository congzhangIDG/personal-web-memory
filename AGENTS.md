# AGENTS.md

## 仓库现状（已核实）
- 仓库当前仅包含 2 个文件：
  - `AGENTS.md`
  - `.omo/run-continuation/ses_19c99475fffeE1JMsl56XHd0iU.json`
- 未发现以下可执行事实来源：
  - `README*`
  - 语言/包管理清单与锁文件（如 `package.json`、`pyproject.toml`、`go.mod` 等）
  - CI 配置（如 `.github/workflows/*`）
  - 任务/构建配置（如 `Makefile`、`Taskfile.yml`、`justfile`）
  - 其他指令文件（如 `CLAUDE.md`、`.cursorrules`、`.github/copilot-instructions.md`）

## 对后续 Agent 的约束
- 不要假设本仓库已有技术栈、启动命令、测试命令或代码结构。
- 在新增任何工程文件前，先确认目标栈与初始化方式；未确认时先提问，不要猜测。
- 若本仓库后续引入实际项目文件（清单、脚本、CI、README），应立即更新本文件，补充可验证命令与执行顺序。

## 当前可执行检查
- 列目录确认仓库状态：`read F:\devAI\app\personal-web-memory`
- 全量文件扫描：`glob **/*`
