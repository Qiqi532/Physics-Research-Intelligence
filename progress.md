# 进度日志

## 会话：2026-08-29

### 阶段 2：公开来源采集
- **状态：** complete
- 执行的操作：
  - 新建 `@pri/sources`，以统一 `SourceConnector` 输出 `PaperSourceInput`，并实现可注入的超时、有限重试、`Retry-After`、指数退避与可见错误码。
  - 实现 Crossref created-date/cursor、OpenAlex Physics and Astronomy field/cursor，以及 arXiv Atom/偏移分页与 3 秒请求间隔。
  - 实现 DOI、标题、摘要、作者、期刊、日期、许可证和开放状态映射；未下载或测试任何全文。
  - 新增 `SourceSyncState` 及第 3 条 Prisma 迁移，记录日期窗口、断点游标、最后成功/失败和规范化错误；已部署到 `public` 和 `pri_stage1_test` schema。
  - worker 新增一次性 `ingest` 入口，三来源独立执行，单来源失败不影响其他结果；本次验证未调用真实生产 API。
  - `.env.example` 增加可选来源联系邮箱与 OpenAlex key；未写入真实密钥，密钥通过 Authorization header 传递。
  - CodeRabbit CLI 未安装，未将差异上传外部服务；完成本地安全、分页、限流、类型与简化审查。

## 测试结果（阶段 2）
| 测试 | 结果 | 状态 |
|---|---|---|
| 全量 Vitest（含 PostgreSQL 集成） | 10 个测试文件、49 个测试通过 | pass |
| Prisma schema/迁移 | schema 有效；`public` 与 `pri_stage1_test` 均已应用 3 条迁移 | pass |
| Workspace lint | Web ESLint 退出码 0 | pass |
| Workspace 类型检查 | Web、worker、domain、db、sources 退出码 0 | pass |
| Web 与 worker 生产构建 | Web 路由与 worker TypeScript 构建成功 | pass |
| 真实公开 API 请求 | 未执行；连接器使用录制 fixture 验证 | intentional |

### 阶段 1：论文事实层与数据浏览 API
- **状态：** complete
- 执行的操作：
  - 实现 DOI、标题、作者规范化，以及基于标题相似度、第一作者和 7 天日期窗的候选重复判断。
  - 建立 9 个基础物理标签，覆盖 AMO/光学、凝聚态与材料、高能、核、天体、统计/计算、等离子体、生物物理和交叉方向。
  - 使用 Prisma `7.10.0` 建立 `Paper`、`PaperSource`、`PhysicsTag`、`PaperClassification`、`PaperInterpretation`、`UserInterest`、`UserPaperState` 与 `AiRun`。
  - 实现事务化论文仓储：同 DOI 合并、来源重放幂等、缺失字段不覆盖已有事实、无 DOI 不自动合并、稳定游标分页。
  - 新增 `GET /api/papers` 和 `GET /api/papers/[doi]`，包含参数校验、来源追踪、标签和通用 503 错误边界。
  - 将两条迁移部署到 `pri_stage1_test` 与本地应用 `public` schema；`public` 当前有 9 张业务表、9 个标签和 2 条已完成迁移。
  - CodeRabbit CLI 未安装，因此未上传代码；完成了本地类型、测试、安全边界与字段合并审查。

## 测试结果（阶段 1）
| 测试 | 结果 | 状态 |
|---|---|---|
| 全量 Vitest | 4 个测试文件、31 个测试通过 | pass |
| Prisma schema | `validate` 退出码 0 | pass |
| PostgreSQL 迁移 | `public` schema up to date；2 条迁移已应用 | pass |
| Workspace lint | 退出码 0 | pass |
| Workspace 类型检查 | Web、worker、domain、db 退出码 0 | pass |
| Web 与 worker 生产构建 | `/api/papers` 与 `/api/papers/[doi]` 构建成功 | pass |
| 差异格式 | `git diff --check` 退出码 0 | pass |

## 阶段 1 错误日志
| 错误 | 尝试次数 | 处理 |
|---|---:|---|
| pnpm 阻止 Prisma 安装脚本 | 1 | 检查固定版本脚本后，只批准 `@prisma/engines` 与 `prisma` |
| 过滤 `exec` 未解析包级 Prisma CLI | 1 | 直接调用已生成的包级 `.CMD`，版本确认为 7.10.0 |
| 首次迁移参数错误进入交互并遗留 advisory lock | 2 | 只读确认持锁会话后终止本轮两个 PID，再以非交互具名迁移成功执行 |
| `?schema=` 未被 `pg` runtime adapter 使用 | 1 | 显式向 `PrismaPg` 传递经校验的 schema，6 项仓储测试通过 |
| `pnpm install --offline` 缺少本机元数据 | 1 | 改用正常 workspace 同步，未改变依赖版本 |

### 阶段 0：初始化与安全边界
- **状态：** complete
- 执行的操作：
  - 将 PostgreSQL `5432` 与 Redis `6379` 的主机端口限制为 `127.0.0.1`，不再监听所有主机接口。
  - 使用 Docker Compose 插件执行 `config` 静态展开，确认两个端口的 `host_ip` 均为 `127.0.0.1`。
  - 补充忽略 `*.tsbuildinfo` 与 `.superpowers/**/state/`；保留设计规格、实施计划及原型内容。
  - 完成配置测试、workspace lint、类型检查与 Web/worker 生产构建，阶段 1 可开始。
- Docker 交接：
  - 当前 worktree 未启动、停止或重建 Docker 容器，也未声称观察到保存项目目录中的 Compose 运行状态。
  - 将本次配置变更同步到 `D:\Physics Research Intelligence` 后，需要在该目录安全重建 PostgreSQL/Redis 并检查健康状态。

## 测试结果（2026-08-29）
| 测试 | 结果 | 状态 |
|---|---|---|
| 配置安全测试 | 1 个测试文件、5 个测试通过 | pass |
| Compose 静态配置 | `config` 退出码 0；5432/6379 均展开为 `host_ip: 127.0.0.1` | pass |
| Workspace lint | 退出码 0 | pass |
| Workspace 类型检查 | Web、worker、domain、db 退出码 0 | pass |
| Web 与 worker 生产构建 | 临时重定向 Next.js `APPDATA` 后退出码 0 | pass |
| PostgreSQL/Redis 容器重建与健康检查 | 未在 worktree 操作；待保存项目目录执行 | handoff |

## 错误日志（2026-08-29）
| 错误 | 尝试次数 | 处理 |
|---|---:|---|
| 当前终端找不到 Docker CLI | 1 | 直接调用 Compose 插件完成只读静态验证 |
| Python 未安装 YAML 模块 | 1 | 未增加项目依赖，改用 Compose 插件 |
| Next.js 用户配置目录写入 `EPERM`，沙箱外重试为 `EXDEV` | 2 | 确认目录带加密属性；本次构建将 `APPDATA` 临时指向系统临时目录后通过 |

## 会话：2026-08-28

### 阶段 0：初始化与安全边界
- **状态：** in_progress
- 执行的操作：
  - 创建 pnpm workspace、Next.js Web、Node worker、共享领域包、数据库包占位、Vitest 与 Compose 骨架。
  - 通过红灯/绿灯测试实现必填环境变量校验、正数预算解析、错误对象与嵌套日志中的密钥脱敏。
  - 配置 pnpm 仅允许 `esbuild` 与 `sharp` 执行依赖构建脚本，未全局放开供应链脚本。
  - 验证 Web 和 worker 使用统一的服务端配置边界；worker 日志只报告连接是否配置，不记录连接串。
- 未完成项：
  - 当前环境找不到 Docker 命令，尚不能启动并验证 PostgreSQL、Redis 健康检查。

## 测试结果（2026-08-28）
| 测试 | 结果 | 状态 |
|---|---|---|
| 配置安全测试 | 5 个测试通过 | pass |
| Workspace 类型检查 | Web、worker、domain、db 通过 | pass |
| Web lint | 通过 | pass |
| Web 与 worker 生产构建 | 通过 | pass |
| Worker 占位配置启动 | 成功且日志无连接串 | pass |
| PostgreSQL/Redis 健康检查 | Docker 命令不可用 | blocked |

## 会话：2026-08-27

### 阶段 1：需求与设计
- **状态：** complete
- 执行的操作：
  - 完成采集策略、Today Physics 首页、论文解读页、系统架构和模型策略的交互式设计确认。
  - 验证本机预览服务可通过 HTTP 200 提供论文解读原型。
- 创建/修改的文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `docs/superpowers/specs/2026-08-27-physics-research-intelligence-design.md`
  - `docs/superpowers/plans/2026-08-27-physics-research-intelligence-mvp.md`
  - 已完成规格与计划自检：五份规划文件存在，未发现 `TBD`、`TODO` 或类似占位符。

## 测试结果
| 测试 | 输入 | 预期结果 | 实际结果 | 状态 |
|---|---|---|---|---|
| 预览服务 | `http://localhost:63390/` | HTTP 200 且显示原型 | HTTP 200 | pass |

## 错误日志
| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|---|---|---:|---|
| 2026-08-27 | Git Bash 后台服务未保活 | 2 | 直接运行 Node 服务 |

## 五问重启检查
| 问题 | 答案 |
|---|---|
| 我在哪里？ | 设计与实施计划已完成，尚未开始编码 |
| 我要去哪里？ | 按 MVP 计划初始化并实现平台 |
| 目标是什么？ | 个人物理科研情报平台 MVP |
| 我学到了什么？ | 见 `findings.md` |
| 我做了什么？ | 见本文件与设计/计划文档 |
