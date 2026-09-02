# 首次手动全流程代码审查与网页试运行报告

> 审查日期：2026-09-02
> 审查分支：`codex/review-manual-pipeline-automation`
> 审查基线：`main@cfd5086`，叠加首次手动全流程产生的未提交修改

## 审查范围

本轮审查覆盖期刊白名单、批量 LLM 筛选、AI Provider/Router/Schema、`PaperScreening` 数据模型与迁移、每日管线编排、Today 查询和排序、单篇解读 API/按钮、手动每日运行入口，以及相关测试和流程文档。

本轮自动验证不调用真实论文来源或付费模型。网页验证优先使用专用测试数据库和 Mock Provider；本地 `.env`、模型密钥、数据库备份和 PDF 均不进入 Git。

## 初始验证基线

### 环境与命令传播

- `pnpm --filter @pri/db prisma:generate` 首次失败：`packages/db/prisma.config.ts` 在工作区目录加载时没有找到仓库根 `.env`，错误为缺少 `DATABASE_URL`。
- 根因验证：当前进程未设置 `DATABASE_URL`，仓库根 `.env` 存在；为 Prisma 进程设置 `DOTENV_CONFIG_PATH` 后生成成功。
- `pnpm vitest` 与 `pnpm exec vitest` 在当前 Windows/pnpm 环境未解析本地命令；直接使用仓库内 `node_modules/.bin/vitest.cmd` 可以启动 Vitest。
- Vite 与 pnpm 递归脚本在受限沙箱中创建子进程时出现 `spawn EPERM`；在获准环境中运行后得到有效测试、类型检查和 Lint 结果。

### 定向测试

执行范围：

```text
tests/domain/journal-whitelist.test.ts
tests/ai/schemas.test.ts
tests/ai/router.test.ts
tests/worker/screen-papers.test.ts
tests/worker/daily-pipeline.test.ts
tests/worker/configured-daily-processor.test.ts
tests/api/today.test.ts
tests/web/components.test.ts
```

初始结果：8 个测试文件中 6 个通过、2 个失败；74 项测试中 72 项通过、2 项失败。

失败项：

1. `tests/api/today.test.ts` 仍断言 `candidateLimit: 50`，实现已改为 `500`。
2. `tests/web/components.test.ts` 直接调用新增 Hook 的 `RecommendationCard`，触发 React `Invalid hook call`。

### 静态检查

- `pnpm typecheck`：7 个工作区全部通过。
- `pnpm lint`：`apps/web` ESLint 通过。
- `git diff --check`：没有空白错误；存在多个文件的 LF/CRLF 工作区提示，不作为代码失败。

## 代码审查发现

| 编号 | 严重度 | 状态 | 发现 |
|---|---|---|---|
| R-01 | 中 | 已复现 | Today 候选池调整为 500 后测试未同步，导致 API 回归测试失败。 |
| R-02 | 中 | 已复现 | 推荐卡片改为 Client Component 并使用 Hook 后，旧测试仍直接调用函数组件。 |
| R-03 | 高 | 已修复并回归 | 批量筛选仅按窗口、批次序号和长度构造幂等键；相同长度但论文集合变化时可能错误复用旧批次。 |
| R-04 | 高 | 已修复并回归 | LLM 筛选返回缺失、重复或未知论文 ID 时会静默保存部分结果并把运行标记为完成。 |
| R-05 | 高 | 已修复并回归 | 单篇解读服务把捕获异常转换为字符串，并由 API 的 503 响应返回浏览器，可能泄露内部连接或路径信息。 |
| R-06 | 低 | 已修复并回归 | 手动运行入口打印 `AI_SETTINGS_MASTER_KEY_FILE` 的完整本机路径，日志不需要该细节。 |
| R-07 | 低 | 已修复 | 四个修改文件带有意外 UTF-8 BOM，需要清理以避免无意义差异。 |
| R-08 | 中 | 已修复并回归 | 单篇解读 API 返回 HTTP 202 时，推荐卡片因 `response.ok` 误显示“解读完成”。 |
| R-09 | 中 | 已修复并扫描 | 语料脚本硬编码本机路径；运行文档/快照包含本机密钥路径和模型连接 UUID。 |
| R-10 | 高 | 已修复并回归 | 期刊白名单方向使用 9 个非正式字符串，无法满足 `PhysicsTag` 外键和 AI Schema。 |
| R-11 | 中 | 已修复并 E2E 回归 | Today E2E 仍假设未解读的高分论文固定排在已有解读论文前，与新排序契约冲突。 |
| R-12 | 中 | 已修复并 E2E 回归 | Today 统计已切换为上海昨日 `createdAt`，E2E fixture 却仍以当前时间入库，无法验证新统计口径。 |

## 修复与回归测试

### 批量筛选

- 新增非法 `batchSize`、论文集合相关幂等键、LLM 缺失论文三项失败测试；修复前 10 项中 3 项失败。
- `screenPapers` 现在在查询前拒绝非正整数批次大小，使用排序后论文 ID 哈希参与幂等键，并要求 LLM 返回的论文 ID 唯一且与输入集合完全相同。
- 修复后 `tests/worker/ai-job.test.ts` 与 `tests/worker/screen-papers.test.ts` 共 10 项全部通过。

### 单篇解读

- 新增核心状态机与 API 路由测试；修复前 9 项中 5 项失败，其中 503 响应包含内部错误字符串。
- 核心解释函数改为可依赖注入测试；内部异常仅交给日志回调，公共 503 固定返回 `service_unavailable`。
- 修复后 2 个测试文件、9 项全部通过。

### Today 与 Web

- Today API 测试同步候选池上限 500；Hook 组件改用 React 渲染测试。
- 新增上海时区昨日 `createdAt` 边界、已解读优先排序、筛选仓储查询和 202 进行中状态测试。
- 推荐卡片对 202 显示“解读任务进行中”，不再误报完成；补充按钮中性化、禁用和错误样式。
- Web/Today 相关 4 个测试文件、30 项通过；仓储/编排 4 个文件、18 项通过；202/UI/路由 3 个文件、20 项通过。

### AI 契约、日志与语料

- 新增筛选 Prompt 摘要 200 字符上限、兴趣参数、严格 Schema 和 Router 主备回退测试；3 个文件、32 项通过。
- 手动运行日志只记录主密钥文件是否配置，不再打印本机路径。
- 语料脚本以脚本位置计算根目录，移除 `D:` 硬编码；许可说明改为逐版本核验。文档和快照不再记录模型连接 UUID 或本机密钥路径。
- journal-corpus 清单、许可边界和可移植性测试共 6 项通过。
- 白名单方向统一为九个正式 PhysicsTag slug，并用导出的 `PhysicsTagSlug` 增加编译期约束；修复前 12 项中 5 项失败，修复后 12 项全部通过。

### 完整测试

最终 `pnpm test` 结果：68 个测试文件中 62 个通过、6 个按既有条件跳过；488 项中 454 项通过、34 项跳过；失败 0。

## 网页试运行

网页试运行使用 loopback PostgreSQL 专用 schema `pri_stage5_e2e`、Redis database 15、本地 Mock Provider 和 `DAILY_PIPELINE_ENABLED=false`。Playwright 阻止外部网络请求，不使用个人数据库、不访问真实论文来源、不调用付费模型。

### 自动化 E2E

- Playwright 桌面 Chromium 与 Pixel 7 两个项目共 32 项全部通过。
- 覆盖 Today 排序与昨日统计、跨方向信号、个性理由、阅读队列、论文详情、摘要解读披露、缺失/损坏解读降级、收藏、阅读状态、模型设置、键盘焦点、横向溢出、存活/就绪以及数据库故障恢复。
- 首轮 E2E 暴露 R-11/R-12 两项过时测试契约；修正 fixture 后全量重跑通过。

### 应用内可见浏览器

- Today 首页实际显示昨日入库 5、开放获取 5、已有解读 2、跨方向信号 1；已有解读的 AMO 论文排在未解读论文前。
- 未解读论文显示“AI 解读”按钮；已有解读论文显示“查看解读”；阅读队列显示 1 篇。
- 详情页完整显示公开摘要、`基于摘要解读`、中文概述、研究问题、创新、方法与证据、局限、证据等级、置信度、引用、阅读建议和来源披露。
- 收藏页空状态、站点导航和 30 天清理说明显示正常；浏览器控制台错误为 0。
- `/api/health/live` 返回 `alive`；`/api/health/ready` 返回 HTTP 200 和 `ready`。
- 桌面可见页面未发现明显横向溢出、按钮重叠或静态资源缺失。移动布局由 Playwright Pixel 7 项目验证通过。

## 最终验证证据

- Prisma schema 校验与客户端生成通过，且过滤工作区运行时可直接加载仓库根 `.env`。
- `pnpm lint` 通过。
- `pnpm typecheck`：7 个工作区全部通过。
- `pnpm test`：454 通过、34 跳过、0 失败。
- `pnpm build`：Worker TypeScript 构建和 Next.js 生产构建通过；standalone 静态资产复制完成。
- `pnpm test:e2e`：32 通过、0 失败。
- 应用内可见浏览器：Today、论文详情、收藏和健康状态通过，控制台错误 0。

## 提交与推送清单

- 已创建独立分支，未修改 `main`。
- 已按设计/计划、仓库整理、语料、功能修复、Prisma 配置、自动化文档和 E2E fixture 分成可回溯提交。
- 最终报告在最终门禁后提交；确认工作区干净且远端分支不存在冲突后再推送。

## 剩余风险和下一步

本轮代码和页面可以进入分支审查，但不应立即打开每日自动开关。现有 BullMQ 时区 scheduler、重试和阶段幂等并不等于生产级无人值守；持久化 `DailyPipelineRun`、跨进程租约/运行锁、心跳与僵尸恢复、`PARTIAL` 状态、人工恢复入口和告警仍未实现。

下一轮应按 `docs/daily-automation-development-and-deployment.md` 实现上述可靠性能力，并完成连续 3 天影子运行、解读成功率不低于 80%、备份恢复演练和用户明确批准后，才可设置 `DAILY_PIPELINE_ENABLED=true`。真实 Kimi 调用和自动调度启用不属于本轮自动验证范围。
