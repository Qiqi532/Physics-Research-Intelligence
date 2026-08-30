# 进度日志

## 会话：2026-08-30（阶段 4）

### 推荐、内部 API 与 Today Physics
- **状态：** in_progress
- 已完成：
  - 检查主工作区 Git 状态、已有 worktree、规划文件和近期提交。
  - 确认 `codex/stage-4` 与目标路径不存在后，从 `00afc9a` 创建隔离 worktree。
  - 开始完整阅读指定设计/计划文件并映射仓库文件。
  - 完成阶段 4 详细 TDD 实施计划与自检；确认现有表足够，本阶段无需迁移。
  - 推荐评分首个失败测试已写入，覆盖五类分项、冷启动、缺失分类/解读、状态和稳定排序。
  - 推荐评分目标红灯：`tests/recommendation/score.test.ts` 因 `packages/recommendation/src/score` 不存在失败，退出码 1。
  - 最小实现新增 `@pri/recommendation`；兴趣、分类、30 日线性新鲜度、跨方向与阅读状态分项可审计，理由最多三条，稳定并列按日期和 ID 排序。
  - 推荐绿灯：单文件 13 项通过；`@pri/recommendation` TypeScript 检查退出码 0。
  - Today 仓储目标红灯：两个测试文件均因 `today-repository` 不存在失败；最小实现后单元 3 项通过，PostgreSQL 2 项等待专用 schema，`@pri/db` 类型检查通过。
  - 详情仓储红灯证明当前实现没有命名的解读/状态投影，并暴露 `toPaperSummary` 对 Prisma 关系对象的过宽展开；修复为显式字段投影后详情与 Today 定向测试 4 项通过。
  - API 红灯：Today 服务模块不存在，论文详情新增两项断言失败；新增 Today/状态路由并严格校验 stage-3 解读后，2 个文件 21 项通过，Web 类型检查通过。
  - 呈现模型红灯为模块不存在；实现 ready/empty/error、缺失/损坏 AI、证据分组和置信度映射后 6 项通过。
  - 服务端组件红灯为模块不存在；首页统计/卡片/队列和详情解读组件完成后，组件与呈现 10 项通过。
  - Today 首页、论文详情、loading/error/not-found、阅读状态控件与响应式样式已完成；UI/API 4 个文件 31 项通过，Web typecheck 与 lint 通过。
  - 生产预览发现 standalone 缺少 `.next/static` 导致 CSS 404；新增失败测试与 postbuild 复制脚本后转绿，重建后 CSS 资源返回 200。
  - 390px 浏览器复核发现标题横向溢出；新增响应式 CSS 失败测试，最小修复后转绿并重新截图确认无裁切。
  - 本地代码审查发现旧 DISLIKE 状态残留和详情重复标签两个警告级问题；均先补失败测试，再最小修复。LIKE 保留、DISLIKE 恢复和标签去重回归共 6 项通过。
  - 浏览器 fixture 下验证阅读状态接口返回 READING/LIKE，详情页 `aria-pressed` 选中且保留“基于摘要解读”；随后清除 3 篇虚构论文与 1 条兴趣记录，数据库计数归零。
  - 桌面首页、390px 首页、论文详情、空状态与不可达数据库错误状态均由隔离本地 Chrome 检查；错误页面未泄露数据库 URL。Codex 内置浏览器因 Windows sandbox workspace 刷新失败，未用于最终截图。
  - 最终全量测试：32 个文件、185 项通过；Prisma generate/validate/migration status 通过，4 条既有迁移全部已应用。
  - 最终 lint、全仓 typecheck、Web production build（含 standalone 资源复制）和 worker production build 均以退出码 0 完成。
  - 暂存终检共 49 个 stage-4 文件；`git diff --cached --check` 通过，敏感值、禁用文件名和 Prisma schema/迁移变化匹配数均为 0，忽略的 `.next`、worker `dist` 与 `tsbuildinfo` 未进入暂存区。
- 错误：
  - 首次本地命令因 workspace 辅助环境刷新失败；改用经审批的执行边界后成功，未产生文件变更。
  - 桌面补丁入口因相同刷新故障失败；改用 stage-3 已验证的 Codex 内建 apply_patch 模式。
  - 推荐测试第一次启动先从本地 pnpm store 恢复锁定依赖（下载 0）；第二次在 Prisma pretest 因当前进程缺少 `DATABASE_URL` 提前失败，尚未到达目标红灯。后续生成步骤使用进程级虚构本地 URL，不读取 `.env`。
  - 首次推荐包类型检查因 ES2022 不支持 `toSorted` 失败；系统化确认根因后只将四处局部不可变排序改为复制后 `.sort`，未放宽全仓 TypeScript 目标，复验通过。
  - 组件测试首次无法解析 Web 的 preserve JSX；无效的 esbuild 修复被 Vite 8 Oxc 明确忽略。读取本地 Vite/rolldown 类型后改为 `oxc.jsx.runtime=automatic`，组件测试开始正常执行。
  - 组件首次真实执行因测试文本遍历器在相邻节点间插入空格失败 1 项；将证据标题/置信度改为单一模板文本节点后 10 项全部通过。
  - 页面首次类型检查发现 Today empty message 未形成严格判别联合；拆分 ready/empty 返回类型后测试、typecheck 和 lint 通过。
  - 应用内浏览器控制运行时连续 3 次因 Windows sandbox workspace refresh helper 失败而无法初始化；重置运行时后根因未变。停止重复尝试，改用本机 headless 浏览器对本地 URL 做截图/视口验证，并在最终结果中保留交互验证限制。

## 会话：2026-08-29

### 阶段 3：AI 分类与结构化解读
- **状态：** complete，最终全量验证通过并已创建本地 Conventional Commit；未 push。
- TDD Task 5-9（配置、成本、预算、数据库与 worker）：
  - 配置/成本红灯后实现可选 AI 路由配置、四家 provider 单价、UTC 成本工具与 provider factory；未配置 AI 时保持采集 worker 兼容。
  - 数据库红灯后新增第 4 条迁移、逻辑 AiRun、物理 AiRunAttempt、安全论文读取、并发 claim、结果幂等和聚合审计。
  - 分类与解读 worker 在模块缺失红灯后分别达到 5 项通过；后续补充持久化失败和失败耗时回归，router + worker 25 项通过。
  - 本地审查发现分类成本被解读预算汇总，新增无数据库回归测试先得到 1 项失败，再将两处汇总限定为 INTERPRET，测试转为通过且 @pri/db 类型检查通过。
  - 第 4 条迁移仅部署到 pri_stage3_test 专用 schema，4 条迁移全部成功；数据库测试 2 个文件、7 项通过。
  - 阶段 3 针对性验证：13 个测试文件、90 项全部通过；没有真实模型 API 调用。
  - 首次全仓测试发现两个 PostgreSQL 测试文件并行清理同一专用 schema，导致 6 项互相干扰失败；生产逻辑未改，Vitest 文件级执行改为串行后，23 个文件、141 项全部通过。
  - Prisma generate、validate 和 migrate status 均通过，pri_stage3_test 已应用全部 4 条迁移；workspace lint 与 typecheck 通过。
  - 使用临时 APPDATA 完成 Web 与 worker 生产构建；Web 4 条既有路由生成成功，worker TypeScript 构建成功。
- TDD Task 3（一次回退 router）：
  - 红灯：router 模块不存在，1 个测试文件失败，退出码 1。
  - 绿灯：14 项通过；四类临时错误各回退一次，八类永久/业务错误不回退，合法 uncertain 不回退，双失败不产生第三次调用。
- TDD Task 4（真实 provider adapter，mock HTTP）：
  - 红灯：四家 provider 模块不存在，1 个测试文件失败，退出码 1。
  - 中间失败：14 项中 12 项通过；OpenAI/Gemini 因 Zod custom 标签无法转换 JSON Schema 各失败 1 项。根因修复为从领域 taxonomy 派生 Zod enum。
  - 绿灯：OpenAI、DeepSeek、Gemini、Qwen mock-HTTP 测试 14 项通过；连同 schema 回归 23 项通过；@pri/ai 类型检查退出码 0。
  - 所有 adapter 只执行单次 HTTP；本轮没有真实 API 请求。
- TDD Task 2（prompt/provider contract）：
  - 红灯：prompt 和 mock provider 模块不存在，2 个测试文件失败，退出码 1。
  - 绿灯：新增版本化安全 prompt、数据库无关 AiProvider contract、稳定错误码、原始 JSON/schema 错误映射和可配置 mock provider；2 个测试文件 14 项通过。
  - 定向 @pri/ai TypeScript 检查退出码 0。
- TDD Task 1（strict schema）：
  - 红灯：使用进程级虚构 DATABASE_URL 通过 Prisma generate 后，tests/ai/schemas.test.ts 因 packages/ai/src/schemas.ts 不存在失败，退出码 1。
  - 绿灯：新增 @pri/ai workspace 骨架与 strict 分类/解读 Zod schema；同一测试文件 9 项通过，退出码 0。
  - pnpm install --lockfile-only 只同步新增 workspace importer，未升级或新增外部依赖版本。
- 工作区准备：
  - 经用户明确授权，将已由用户删除的旧阶段 3 目录对应的失效 worktree 注册作为安全检查例外处理。
  - worktree prune dry-run 只命中该失效注册；实际清理未影响其他 worktree。
  - codex/stage-3 无领先于 origin/main 的提交，已非强制删除并从固定基线重新创建。
  - 新工作区为 D:\Physics Research Intelligence\.worktrees\stage-3，当前分支 codex/stage-3，HEAD 为 6101ea5b200af3397fe2c63cc92ba62dde8e06c9，初始状态干净。
  - 桌面补丁工具的 Windows workspace 刷新辅助进程无法处理本轮新 worktree；根因诊断后改用同一 Codex 可执行文件的内建 apply_patch 模式，补丁引擎验证成功。
  - 本轮未 push、未调用真实 AI API、未读取 .env 值。

### 阶段 2：公开来源采集
- **状态：** complete
- 执行的操作：
  - 新建 `@pri/sources`，以统一 `SourceConnector` 输出 `PaperSourceInput`，并实现可注入的超时、有限重试、`Retry-After`、指数退避与可见错误码。
  - 实现 Crossref created-date/cursor、OpenAlex Physics and Astronomy field/cursor，以及 arXiv Atom/偏移分页与 3 秒请求间隔。
  - 实现 DOI、标题、摘要、作者、期刊、日期、许可证和开放状态映射；未下载或测试任何全文。
  - 新增 `SourceSyncState` 及第 3 条 Prisma 迁移，记录日期窗口、断点游标、最后成功/失败和规范化错误；已部署到 `public` 和 `pri_stage1_test` schema。
  - worker 新增一次性 `ingest` 入口，三来源独立执行，单来源失败不影响其他结果；本次验证未调用真实生产 API。
  - `.env.example` 增加可选来源联系邮箱与 OpenAlex key；未写入真实密钥，密钥通过 Authorization header 传递。
  - 一次性入口只在配置有效 `CROSSREF_ISSN` 时启用 Crossref，防止将全学科日更新误当作物理论文池。
  - CodeRabbit CLI 未安装，未将差异上传外部服务；完成本地安全、分页、限流、类型与简化审查。

## 测试结果（阶段 2）
| 测试 | 结果 | 状态 |
|---|---|---|
| 全量 Vitest（含 PostgreSQL 集成） | 10 个测试文件、51 个测试通过 | pass |
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
