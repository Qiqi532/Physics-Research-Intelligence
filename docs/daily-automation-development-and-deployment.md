# 每日全自动流程：开发、验收与部署规范

> 版本：v1.0（2026-09-02）
> 适用范围：Physics Research Intelligence 单用户本地部署
> 依据：2026-09-01 首次手动全流程及 2026-09-02 代码审查

本文把已经存在的调度能力与尚未完成的生产可靠性能力明确分开。当前默认值必须保持 `DAILY_PIPELINE_ENABLED=false`；只有完成本文的强制门槛、连续影子运行并得到人工批准后，才可改为 `true`。

## 1. 目标与边界

每日任务按一个稳定的 `Asia/Shanghai` 日窗口运行：采集公开元数据、期刊白名单筛选、LLM 批量筛选、对选中论文进行摘要级中文解读、准备 Today、清理过期且未收藏的普通论文。

边界如下：

- 只向模型发送公开元数据和摘要，不发送本地 PDF 或受限全文。
- PostgreSQL 是事实来源；Redis/BullMQ 是可重建的队列状态。
- 单篇解读失败可以形成“部分失败”，但不能伪装成完整成功。
- 当前应用没有登录，只允许 localhost 或有可靠外部访问控制的可信网络；不得直接公开到互联网。
- API Key、数据库 URL、模型连接 ID 和主密钥路径不得出现在 Git、命令输出、运行快照或告警正文中。

## 2. 当前能力与缺口

| 能力 | 当前状态 | 代码/行为 | 上线要求 |
|---|---|---|---|
| 时区定时调度 | 已实现 | BullMQ 稳定 scheduler ID；支持 `HH:mm` 与 IANA 时区 | 验证时区和夏令时边界 |
| 队列重试 | 已实现 | 每日 job 最多 2 次，指数退避 30 秒 | 按错误类型细化可重试策略 |
| Worker 并发 | 已实现 | 单进程并发为 1 | 未有全局锁前只运行一个 worker |
| 阶段幂等 | 部分实现 | 来源游标、筛选输入哈希、AI 幂等键、部分逻辑 claim | 增加整次运行级状态和租约 |
| 失败隔离 | 部分实现 | 单来源/单篇失败可记录；全部来源失败会停止 | 明确定义 `PARTIAL` 与恢复入口 |
| 运行状态 | 未实现 | 没有持久化的每日运行总记录 | 增加 `DailyPipelineRun` |
| 跨进程运行锁 | 未实现 | scheduler 稳定不等于互斥锁 | 增加数据库租约或 advisory lock |
| 心跳与僵尸恢复 | 未实现 | 进程退出后不能判定旧运行是否可接管 | 增加 lease、heartbeat、stale recovery |
| 告警 | 未实现 | 只有结构化日志和健康端点 | 经用户批准后接入一个告警适配器 |
| 自动发布/回滚 | 未实现 | 有构建、迁移、备份恢复步骤 | 增加受监督服务与版本化发布流程 |

结论：调度器已存在，但“已定时”不等于“可无人值守”。运行锁、持久化状态、恢复和告警完成前，不得宣称每日流程具备生产级全自动可靠性。

## 3. 目标状态机

每个上海日期窗口只能有一条权威运行记录：

```text
PENDING -> RUNNING -> SUCCEEDED
                   -> PARTIAL
                   -> FAILED
```

- `PENDING`：窗口已创建，尚未获得运行租约。
- `RUNNING`：持有未过期租约，并持续更新心跳。
- `SUCCEEDED`：强制阶段均完成，允许存在明确标注的非关键清理警告。
- `PARTIAL`：Today 仍可用，但有来源或单篇解读失败；必须保存计数和稳定错误码。
- `FAILED`：无法形成可信结果，例如全部来源失败、配置错误或数据库事务失败。

同一窗口重跑不能创建第二套结果。操作员重跑只允许接管已过期租约，或从失败阶段恢复；所有状态迁移必须带时间、尝试次数和摘要计数。

## 4. 开发实施顺序

### 阶段 A：建立运行账本

1. 在 `packages/db/prisma/schema.prisma` 增加 `DailyPipelineRun`，至少包含：窗口唯一键、状态、attempt、started/heartbeat/finished 时间、lease owner/expiry、各阶段计数、最后稳定错误码。
2. 新增迁移和 `packages/db/src/daily-run-repository.ts`，用数据库唯一约束保证一个窗口一条记录。
3. 仓储测试必须覆盖并发创建、合法状态迁移、非法倒退、重复完成和计数更新。
4. 迁移必须可在生产数据副本上执行，并通过 `prisma migrate deploy`；不得依赖开发期 `migrate dev`。

### 阶段 B：实现运行锁与心跳

1. Worker 开始前原子获取租约；租约必须包含不可猜测的 owner token 和到期时间。
2. 运行期间定期续租；写状态前验证 owner token，避免旧进程覆盖新进程。
3. 正常结束释放租约；异常退出依靠到期恢复。
4. 测试两个 worker 同时竞争、旧租约未过期、租约过期接管、心跳丢失和旧 owner 延迟写入。
5. 此阶段完成前，部署拓扑强制为一个 worker。

优先选择 PostgreSQL 行级租约，因为运行账本和业务数据位于同一事实库；若采用 PostgreSQL advisory lock，仍需运行账本记录可观察状态，不能只依赖内存或 Redis 锁。

### 阶段 C：阶段化恢复与部分失败

1. 为 `INGEST`、`SCREEN`、`INTERPRET`、`TODAY`、`CLEANUP` 记录开始、完成、输入哈希和摘要结果。
2. 保留现有阶段幂等键；恢复时跳过输入未变化且已经完成的阶段。
3. 全部来源失败直接 `FAILED`；部分来源失败继续，但最终至少为 `PARTIAL`。
4. 单篇解读失败不回滚其他论文；失败保留稳定错误码，并允许下一次显式重试。
5. 清理失败不得让 Today 消失，但最终状态必须显示警告或 `PARTIAL`。
6. 用中断注入测试每个阶段后的重启收敛，验证没有重复 `PaperScreening`、`PaperInterpretation` 或审计记录。

### 阶段 D：重试、人工控制和死信

1. 只对 timeout、rate limit 和短暂连接失败自动重试；authentication、configuration、business validation 不盲目重试。
2. 供应商重试采用有界指数退避和抖动；每日外层 job 保持小次数，避免内部重试相乘。
3. 提供只在本机执行的 `status`、`retry --window`、`resume --window`、`skip --window --reason` 操作命令。
4. 人工操作写入运行账本，不删除失败证据，不接受命令行 API Key。
5. 超过重试上限的运行进入可查询的失败集合，而不是无限循环。

### 阶段 E：可观测性与告警

每次运行至少记录：窗口、run ID、阶段、状态、耗时、输入/选中/成功/失败数量、provider/model 公共名称、稳定错误码。不得记录 Prompt 全文、摘要正文、密钥、连接字符串、密文或内部异常栈到公开响应。

建议门槛：

- 当日 08:00 前没有终态：告警。
- 整次 `FAILED`：立即告警。
- `PARTIAL` 或解读成功率低于 80%：告警并保留人工复核入口。
- 队列 backlog 超过 100 或 worker unavailable：告警。
- 连续 2 天 `PARTIAL/FAILED`：暂停自动运行，要求人工处理。

告警属于新的外部网络行为。只有用户明确选择渠道并提供环境变量后才能接入；实现统一 adapter，日志作为默认无网络后端，邮件/消息平台不得写死地址或凭据。

## 5. 测试与验收矩阵

每次改动先跑最小相关测试，再跑完整门禁：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

强制场景：

| 类别 | 场景 | 验收结果 |
|---|---|---|
| 幂等 | 同一窗口连续执行两次 | 论文、筛选、解读和审计不重复 |
| 并发 | 两个 worker 同时启动 | 只有一个获得运行锁 |
| 恢复 | 每阶段后强制退出再启动 | 从可信断点收敛到一个终态 |
| 来源 | 一个来源失败 | 继续并标记 `PARTIAL` |
| 来源 | 全部来源失败 | 停止 AI 阶段并标记 `FAILED` |
| 模型 | timeout/rate limit | 有界退避后成功或形成真实失败 |
| 模型 | authentication/configuration | 不重复付费调用，立即失败 |
| 输出 | LLM 返回未知/缺失/重复 ID | 整批拒绝，不保存部分伪成功 |
| 数据 | 清理阶段失败 | Today 可用，运行显示警告/部分失败 |
| 时区 | 上海日期边界和跨年 | 窗口唯一、昨日统计正确 |
| 安全 | 日志与响应扫描 | 无 API Key、URL 密码、内部路径或连接 ID |
| Web | 桌面与移动端 | Today、详情、收藏、202 解读状态和错误态可用 |

自动测试只使用专用测试数据库与 Mock Provider，禁止访问真实模型和真实论文来源。真实供应商试运行必须由人工明确发起并接受可能费用。

## 6. 部署拓扑与启动顺序

最低版本：Node.js 22、pnpm 11.19、PostgreSQL 17、Redis 7。Web 和 worker 使用相同数据库及同一个仓库外主密钥文件；进程由操作系统 supervisor 管理，环境变量由服务环境注入。

推荐拓扑：

```text
localhost / protected proxy
          |
       Next.js Web
          |
 PostgreSQL 17 --- Redis 7 --- one BullMQ worker
   source of truth   queue       daily pipeline
```

启动顺序：PostgreSQL/Redis -> 数据库备份 -> 迁移 -> worker -> Web -> 健康检查。首次准备命令：

```powershell
Copy-Item .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm install --frozen-lockfile
pnpm --filter @pri/db prisma:validate
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:deploy
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

生产运行使用两个受监督进程：

```powershell
pnpm --filter @pri/worker start
pnpm --filter @pri/web start
```

在运行锁验收前只允许一个 worker。supervisor 应在崩溃后有界重启，并以正常终止信号停止进程。具体备份、恢复、standalone 静态文件与健康端点见 `docs/operations.md`。

## 7. 发布、数据库迁移与回滚

每次发布形成不可变 Git commit/标签或构建目录，保留上一个可运行版本。顺序如下：

1. 在独立分支完成审查与全部门禁，确认没有未追踪的运行数据。
2. 对 PostgreSQL 做 custom-format 备份，记录 SHA-256，并在独立数据库完成恢复演练。
3. 停止 worker，避免迁移期间启动新运行；Web 进入维护状态或停止写请求。
4. 执行 `pnpm --filter @pri/db prisma:deploy`，再启动新 worker 和 Web。
5. 检查 `/api/health/live`、`/api/health/ready`、Today、论文详情和最新运行状态。
6. 保留旧版本、数据库备份和匹配的主密钥备份，直到至少一次每日运行成功。

回滚原则：

- 纯应用问题：停止新进程并重新启动上一版本；不要回退已经成功执行的兼容迁移。
- 破坏性或不兼容迁移：保持服务停止，从发布前备份恢复到新的数据库实例，验证后再切换；不得在活动库上试恢复。
- Redis 不作为恢复来源。清空或丢失后由 worker 重建 scheduler，但必须先核对运行账本，避免重复窗口。
- 回滚后记录失败版本、迁移版本、窗口状态和恢复证据，不删除失败记录。

## 8. 从手动运行到自动启用

### 8.1 影子运行

保持：

```dotenv
DAILY_PIPELINE_ENABLED=false
DAILY_PIPELINE_TIME=06:00
DAILY_PIPELINE_TIMEZONE=Asia/Shanghai
```

由人工在固定时段执行手动入口，连续 3 天记录输入量、白名单命中、选中数、解读成功率、总耗时、失败码、Today 页面和健康端点。三天都应满足：

- 没有重复数据或泄密日志；
- 解读成功率不低于 80%；
- 失败能够形成真实 `PARTIAL/FAILED` 并可恢复；
- 收藏和阅读状态不受清理影响；
- 备份恢复演练有效；
- 桌面与移动端页面验收通过。

### 8.2 启用门槛

以下项目全部完成且由用户明确批准，才可设置 `DAILY_PIPELINE_ENABLED=true`：

- [ ] `DailyPipelineRun` 状态机、唯一窗口和运行锁已实现并测试。
- [ ] 心跳、过期租约接管和阶段恢复已测试。
- [ ] `SUCCEEDED/PARTIAL/FAILED` 规则与操作员重跑入口已实现。
- [ ] 告警渠道已获批准并完成脱敏测试。
- [ ] 连续 3 天影子运行达标，解读成功率均不低于 80%。
- [ ] 完整测试、E2E、生产构建和可见网页试运行通过。
- [ ] 发布前备份和独立恢复演练通过，回滚责任人与命令明确。
- [ ] Web 仍只在 localhost/受保护网络；公开访问已有认证或可靠外部控制。

启用后的第一周每天人工检查终态、失败详情和页面；出现连续两天异常时先改回 `false`，保留证据后修复，不能靠无限重跑掩盖问题。

## 9. 每日操作清单

运行前：

- 检查数据库/Redis、worker 和就绪端点。
- 确认最近备份可恢复、磁盘空间充足、模型连接测试近期有效。
- 检查上一个窗口已进入终态，没有未过期的孤立租约。

运行后：

- 核对运行终态、阶段耗时、采集/筛选/解读数量和稳定错误码。
- 抽查 Today 与至少一篇详情；确认“基于摘要解读”披露和 202 进行中状态真实。
- 检查收藏保留、30 天清理和日志脱敏。
- 对 `PARTIAL/FAILED` 先诊断根因，再决定重试；不要直接修改数据库状态。

## 10. 本轮建议

本轮可以合并代码修复和本文档，但不应顺带打开自动开关。下一轮开发按“运行账本 -> 运行锁/心跳 -> 阶段恢复 -> 告警/操作入口 -> 连续 3 天影子运行”的顺序推进，每个阶段单独提交、单独回归，最终再申请启用。
