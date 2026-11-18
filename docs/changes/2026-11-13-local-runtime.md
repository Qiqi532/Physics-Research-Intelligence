# 首日本地运行改造记录

日期：2026-11-13。范围：默认本地运行、Redis 可选、一次性每日任务入口、午间参数和对应回归。没有安装 Windows 自动任务，也没有执行真实采集、模型调用或数据库迁移。

## 完成内容

- 新增 `RUNTIME_MODE=local|queue`，默认 `local`。本地配置无需 `REDIS_URL`；显式选择 `queue` 时才要求 Redis。
- `pnpm dev` 只启动 Web。`pnpm dev:queue` 保留原 Web/worker 联合启动方式，需要另行配置队列模式。
- Compose 的 Redis 服务归入 `queue` profile。默认服务只有 PostgreSQL；没有停止或删除任何已有容器或数据卷。
- 本地 readiness 只检查 PostgreSQL，Redis、队列、worker 显示 `disabled`；数据库失败仍返回 503。测试直接断言本地模式没有创建 Redis/Queue 客户端。
- 新增根命令 `pnpm daily:run`，复用原有流水线，执行一次后退出。入口导入无副作用，不读取环境文件、不自动开始采集。
- CLI 明确读取仓库根目录 `.env`，不覆盖继承变量；文件缺失可使用继承配置，文件不可读则停止启动。
- 返回码 `0` 表示各阶段与资源释放均成功；异常、部分失败、尚在处理或资源释放失败返回 `1`。只记录汇总与稳定错误码，省略原始模型异常。
- 将易失败的模型设置初始化移入 `process()`，使调用方先拿到数据库关闭句柄；队列初始化失败、worker 关闭失败时也释放队列。
- 默认时间 `12:15`、时区 `Asia/Shanghai`，目标 5–8 篇，候选不足可少推。同步筛选 Prompt 并升级为 `screen-v2`，避免沿用旧 Prompt 缓存。
- 暂不开发金额预算与费用看板，沿用既有超时、重试和输出限制。

## 启动与配置

在仓库根目录使用现有数据库和配置启动 Web：

```powershell
docker compose -f infra/docker-compose.yml up -d postgres
pnpm dev
```

`docker compose ... config --services` 已确认默认只有 PostgreSQL。现有 Redis 容器可能仍在运行，配置变化不会自动停止它，但本地模式不会使用它。

Web 使用原有 `apps/web/.env*` 或继承的环境；CLI 使用根目录 `.env`。数据库、主密钥路径和运行模式应一致。本轮没有覆盖这些现有文件，因此旧的显式时间/目标值仍优先于代码新默认值。采用新默认值时只调整非密钥设置：

```dotenv
RUNTIME_MODE=local
DAILY_PIPELINE_ENABLED=false
DAILY_PIPELINE_TIME=12:15
DAILY_PIPELINE_TIMEZONE=Asia/Shanghai
DAILY_PAPER_TARGET_MIN=5
DAILY_PAPER_TARGET_MAX=8
```

准备好数据库与模型后，手动真实执行的入口为：

```powershell
pnpm daily:run
```

这不是 dry-run：它会访问公开来源、调用所配置的模型、写入数据库，并执行原有 30 天非收藏论文清理。本轮没有运行此命令。它不受自动调度关闭开关阻止，也不会注册自动任务。12:15 目前用于计算稳定日期窗口，12:15 之前手动执行会使用上一窗口。

## 验证结果

| 检查 | 结果 |
|---|---|
| 改动前定向基线 | 5 个文件、50 个用例通过 |
| 新行为定向回归 | 9 个文件、82 个用例通过；随后新增的环境错误测试包含在完整回归中 |
| `pnpm test` | 66 个文件通过、6 个跳过；496 个用例通过、34 个跳过 |
| `pnpm typecheck` | 工作区类型检查通过 |
| `pnpm lint` | 通过 |
| `pnpm build` | worker 编译、Web 生产构建及 standalone 资源复制通过 |
| Compose 配置解析 | 默认只有 `postgres`；启用 `queue` profile 后为 `postgres`、`redis` |
| standalone 服务文件与静态资源 | 均存在 |
| `git diff --check` | 通过 |

完整回归在测试进程中将 `TEST_DATABASE_URL` 置空，所以需要真实数据库的 34 个用例跳过；没有运行 Playwright E2E。构建使用不可用的本地测试数据库地址、本地模式和关闭的框架遥测。上述结果不代表真实论文推荐质量或无人值守调度已经验收。

测试期间发现根目录不能直接解析工作区私有依赖，导致按包名注册的部分 mock 没有替换到实际模块。通过对比 `createRequire(...).resolve(...)` 确认原因后，测试改用工作区实际模块路径；未增加根依赖或改变生产解析规则。

## 本轮改动文件清单

配置与命令：

- `.env.example`
- `package.json`
- `apps/worker/package.json`
- `infra/docker-compose.yml`
- `packages/domain/src/config.ts`

实现：

- `apps/web/src/server/health.ts`
- `apps/web/src/server/configured-health.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/worker-runtime.ts`
- `apps/worker/src/manual-daily-run.ts`
- `apps/worker/src/daily-runner.ts`（新增）
- `apps/worker/src/configured-daily-processor.ts`
- `packages/ai/src/prompts/screen.ts`

测试：

- `tests/domain/config.test.ts`
- `tests/api/health.test.ts`
- `tests/api/configured-health.test.ts`（新增）
- `tests/worker/runtime.test.ts`
- `tests/worker/scheduler.test.ts`
- `tests/worker/configured-daily-processor.test.ts`
- `tests/worker/daily-runner.test.ts`（新增）
- `tests/worker/manual-daily-run.test.ts`（新增）
- `tests/ai/prompts.test.ts`

文档：

- `README.md`
- `docs/operations.md`
- `docs/changes/2026-11-13-local-runtime.md`（本文件）

本轮没有改动原有评审材料、项目说明文档、真实环境文件、数据库 schema/迁移或 `D:\资料\毕设\文献`。

## 留待后续的能力

持久运行台账、单实例保护、固定日报快照、开机补跑和 Windows 午间自动任务仍待下一阶段。课题画像与定向采集、本地目录/Zotero 接入、全文检索、双模型复核和 RAG 也不属于首日交付。
