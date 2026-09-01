# 任务计划：物理科研情报平台 MVP

## 目标
为个人物理学习与研究建立一个可持续的 Today Physics 网站：合规聚合论文元数据、提供可核验的 AI 解读，并按个人兴趣推荐阅读内容。

## 当前阶段
阶段 9：本地论文生命周期、阅读助手与收藏库 RAG（Kimi 摘要试运行已完成；9A 已实现并完成审查修复，待集成验收）

## 各阶段

### 阶段 1：需求与发现
- [x] 确认第一版为单用户，保留多用户扩展空间
- [x] 确认覆盖全部物理方向，不固定单一主方向
- [x] 确认公开接口优先、学校订阅仅用于原文跳转
- [x] 确认 Today Physics 首页与论文解读页信息结构
- **状态：** complete

### 阶段 2：规划与结构
- [x] 确定模块化单体架构与数据边界
- [x] 确定多云模型 API 抽象与两级处理策略
- [x] 输出设计规格与 MVP 实施计划
- **状态：** complete

### 阶段 3：实现
- [x] 初始化 Web、API、数据库与本地开发环境
- [x] 实现论文数据模型、标签体系、保守去重和数据浏览 API
- [x] 实现 Crossref、OpenAlex、arXiv 公开来源连接器
- [x] 实现 AI 分类与结构化解读流水线
- [x] 实现推荐与 Today Physics 页面
- **状态：** complete（stage-4 在隔离 worktree 中完成推荐、内部 API、首页与详情页）

### 阶段 4：测试与验证
- [x] 完成本阶段单元、PostgreSQL 集成与本地浏览器质量评审
- [x] 验证事实/解读边界、安全错误态和无新增模型调用
- [x] 增加正式 Playwright E2E
- [ ] 完成至少 30 篇人工内容质量评审
- **状态：** in_progress（阶段 4 交付门禁已通过；长期试运行评审留待下一阶段）

### 阶段 5：交付
- [x] 补齐兴趣设置与正式 Playwright E2E
- [x] 实现每日幂等调度、安全健康检查与失败恢复
- [x] 完成个人部署、备份恢复和 30 篇质量评审模板
- [x] 扩展 GLM、Kimi、混元及通用 OpenAI-compatible 模型接入
- [x] 完成全量验证、本地代码审查与测试产物清理
- [x] 创建本阶段 Conventional Commit
- **状态：** complete（代码、测试、文档、审查与提交门禁完成；真实部署和 30 篇人工评审按交付说明执行）

### 阶段 6：全仓审查、备份与合并
- [x] 刷新远端引用并确认 main、stage-5 与历史阶段的祖先关系
- [x] 完成全仓源码、依赖、安全边界与严重/警告级问题审查
- [x] 重新执行单元、PostgreSQL、Playwright、Prisma、构建和敏感信息门禁
- [x] 为合并前 main 建立并推送可追溯备份引用
- [x] 在独立集成工作树完成非快进合并与完整复验
- [x] 更新并核验远端 main
- [x] 写入项目现状、部署建议、后续路线与人工操作清单
- **状态：** complete（合并前备份、全仓审查、独立非快进合并、合并树复验与远端 main 更新均已完成）

### 阶段 7：零成本本地真实数据试运行
- [x] 审计历史分支并确认所有旧阶段已进入远端 main
- [x] 确认 localhost 为必选、可信局域网为可选的零成本访问边界
- [x] 完成本地真实语料、导入、运行、安全和验收设计
- [x] 用户审阅并确认书面设计规格
- [x] 编写详细 TDD 实施计划
- [x] 下载并校验九方向官方开放论文语料
- [x] 实现幂等语料导入与本地/局域网启动边界
- [x] 在真实本地页面完成桌面与可选移动端验收
- [x] 完成全量验证、清理、审查、提交与 push
- **状态：** complete（本地真实数据试运行、桌面/移动验收、全量门禁和可追溯发布均已完成；30 篇人工内容评审仍为明确人工任务）

### 阶段 8：页面内模型连接管理台
- [x] 核对现有 provider、配置、worker 与数据库边界
- [x] 确认多命名连接、本机加密保存、两级测试与热切换语义
- [x] 用户选择并批准管理台布局
- [x] 完成架构、安全、数据、API、错误与测试设计
- [x] 用户复核书面设计规格
- [x] 编写详细 TDD 实施计划
- [x] 完成 strict 配置契约与 AES-256-GCM 本机密钥边界
- [x] 完成 Prisma 新迁移、密文仓储与任务路由持久化
- [x] 完成八供应商单连接工厂与安全两级连接测试运行器
- [x] 完成本地写保护、密文 service、测试限流与内部模型设置 API
- [x] 完成 worker 每批次路由快照、同供应商任务隔离与无需重启热切换
- [x] 完成 `/settings/models` 管理台、多命名配置、复制/轮换/删除与任务路由
- [x] 完成 loopback mock provider、专用 schema、桌面与移动 Playwright
- [x] 完成主密钥备份恢复文档、全量验证、数据清理和本地代码审查
- [x] 推送 `codex/stage-8-model-console` 并将通过验证的版本快进到远端 `main`
- [x] 从 Today 首页加入模型管理入口回归并完成本地生产页面复验
- **状态：** complete（远端 `main@35faead`、数据库 5 条迁移、模型管理台与 24 项 Playwright 均已核验；真实 Provider Key 测试和 30 篇人工评审留给人工执行）

### 阶段 9：本地论文生命周期、阅读助手与收藏库 RAG
- [x] 确认普通论文按本地采集时间保留 30 天，收藏论文长期保留
- [x] 确认收藏与阅读进度正交，不复用 `SAVED` 作为永久收藏标志
- [x] 确认仅在许可证明确允许时自动保存 PDF，合法个人 PDF 可手动导入
- [x] 将每日 00:00、10–15 篇、收藏库、阅读助手和 RAG 拆成独立交付阶段
- [x] 写入主路线图与下一次对话接续步骤
- [x] 发布完整中英文 README，并更新 45 篇 journal-corpus 的公开 metadata/摘要安全边界
- [x] 实现最多三篇、幂等、可审计的 Kimi 摘要试运行 CLI
- [x] 完成 396 项 Vitest、全仓 lint/typecheck、Web/worker 生产构建与本地安全审查
- [x] 9A：每日选择、独立收藏状态、30 天清理与个人收藏页（独立分支已实现并完成审查修复）
- [ ] 9B：开放许可 PDF 自动保存和本地 CLI 手动导入
- [ ] 10：有来源披露的单篇论文阅读助手
- [ ] 11：基于收藏论文的可重建 RAG 索引与跨论文问答
- [x] 使用 Kimi K2.6 完成三篇真实摘要的分类/解读试运行
- [ ] 完成至少 30 篇跨方向人工质量评审
- **状态：** in_progress（9A 已完成并逐任务提交，审查修复为 `9d33ef9`；正在移除本地成本/预算门槛并集成验收；9B、10、11 分别审查设计后再启动）

#### 阶段 9A：每日选择、收藏与 30 天清理（2026-09-01 完成）
- [x] Task 1 收藏正交：`UserPaperState.isFavorite/favoritedAt` 与第 6 条迁移 `20260901092205_add_user_paper_favorite`，收藏按钮与详情/Today 暴露（commit `320588b`）
- [x] Task 2 配置：`PAPER_RETENTION_DAYS=30`、`DAILY_PAPER_TARGET_MIN=10`、`DAILY_PAPER_TARGET_MAX=15` 严格整数解析与 min<=max 不变式（commit `eb8e7e7`）
- [x] Task 3 确定性多样化选择：`selectDailyPapers`/`buildDailySelection`，10–15 篇、冷启动、兴趣命中、跨方向、确定性并列、窗口重跑稳定（commit `b2bc809`）
- [x] Task 4 安全清理：`pruneExpiredPapers` 只删过期非收藏、级联清理、Today 后执行且失败可恢复（commit `c186924`）
- [x] Task 5 个人收藏页：`/library` 页 + `LibraryPaperList` + `listFavorites` + 首页导航 + 组件/仓库/e2e 测试（commit `bdc2f3b`）
- [x] Task 6 运维验证与文档：全量 Vitest/typecheck/lint/Playwright/生产构建/Prisma 门禁、E2E schema 零业务数据、六份文档更新、日程默认改上海午夜（commit `157ef02`）

## 已做决策
| 决策 | 理由 |
|---|---|
| 单用户 MVP | 快速验证研究价值，数据模型预留 `user_id` |
| 全物理覆盖、偏好排序 | 防止首页被预设学科偏见锁定，保留交叉发现 |
| 聚合数据库优先 | 可持续、低维护，降低出版社页面改版风险 |
| 订阅全文不入库 | 不绕过访问控制，不将付费全文发送给模型 |
| 多云 API 适配层 | 可在 DeepSeek、OpenAI、Gemini、Qwen、GLM、Kimi、混元及通用兼容模型间比较和切换 |
| 普通论文 30 天、收藏长期保留 | 控制个人数据库与磁盘增长，同时保护明确选择的研究资料 |
| 收藏与阅读状态正交 | 收藏论文仍可独立处于稍后读、阅读中或完成状态 |
| PDF 下载按许可失败关闭 | 许可证缺失或含糊时不自动下载；受限全文不进入自动采集或模型输入 |
| 阅读助手与 RAG 分阶段 | 先验证单篇证据问答，再扩展到收藏库检索，降低错误引用和成本风险 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|---|---:|---|
| 阶段 9 交接补丁假定 `progress.md` 标题为“进度记录” | 1 | 读取实际文件头，确认 `findings.md` 已写入且无重复，仅按真实“进度日志”标题补入进度 |
| Codex 桌面补丁入口在新 worktree 后刷新 Windows workspace 失败 | 3 | 根因定位到 workspace 刷新辅助进程；改用同一 Codex 可执行文件的内建 apply_patch 模式，已验证可创建、更新和删除文件 |
| 阶段 3 计划补丁正文被命令编排层解析 | 1 | 移除非必要行内代码标记并缩小补丁上下文后成功应用 |
| Git Bash 后台预览服务被回收 | 2 | 改为直接启动 Node 预览服务，HTTP 200 验证 |
| 首次本地执行器初始化失败 | 2 | 改用已审批的 PowerShell 只读边界后成功，未修改文件 |
| 批量读取规划文档输出被截断 | 1 | 改为逐文件读取并完成五份指定文档阅读 |
| 新 worktree 的补丁刷新辅助进程失败 | 2 | 改用 Codex 内建 apply_patch 模式，保持补丁式编辑 |
| Codex 本地命令环境首次初始化失败 | 1 | 改用经审批的只读执行边界后成功，未修改任何文件 |
| Codex 桌面补丁入口在 stage-4 刷新 Windows workspace 失败 | 1 | 改用 stage-3 已验证的 Codex 内建 apply_patch 模式 |
| 当前终端找不到 Docker CLI | 1 | 使用已安装的 Compose 插件完成 `config` 静态验证；容器重建留待保存项目目录执行 |
| Python 环境缺少 YAML 模块 | 1 | 不安装额外依赖，改用 Docker Compose 官方插件验证配置 |
| Next.js 写入加密的用户配置目录失败（`EPERM`/`EXDEV`） | 2 | 仅在构建命令中将 `APPDATA` 指向临时目录，生产构建通过 |
| pnpm 拦截 Prisma 构建脚本 | 1 | 仅将固定版本的 `@prisma/engines` 与 `prisma` 加入现有 `allowBuilds` 白名单 |
| 首次 Prisma 迁移参数进入交互提示并遗留 advisory lock | 2 | 确认并终止本轮两个迁移会话，改为直接调用包级具名迁移 |
| PostgreSQL adapter 默认查询 `public` 而测试表位于独立 schema | 1 | 从 URL 解析并校验 schema，显式传给 `PrismaPg` adapter |
| Windows 下 `pnpm exec vitest` 未解析根工作区二进制 | 1 | 改用 `pnpm test <test-file>` 通过根脚本传入精确测试文件 |
| arXiv 限流测试第二次读取已消费的 `Response` | 1 | 根因是 fixture 共享单次读取响应体；改为每次 mock 调用新建 `Response` |
| 可选来源配置测试要求缺失字段仍以 `undefined` 存在 | 1 | Zod 会省略未提供的可选键；改为断言属性不存在，并保留提供值的正向测试 |
| 手工派生测试 schema URL 时 Prisma schema engine 无法解析 | 1 | 脱敏诊断确认 `.env` URL 有效；根因是手工读取保留了 dotenv 本会移除的外层引号，派生前显式去除 |
| 在不读取现有值的前提下向忽略的 worker `.env` 追加可选键 | 3 | 补丁无法安全匹配且环境层隐藏原文；停止修改，保留现有值，改由 `.env.example` 记录两个可选键 |
## Active continuation — LLM runtime without budget blocking + Stage 9A integration

- [x] Locate the Stage 9A branch/worktree and confirm its relationship to `main`.
- [x] Inspect the main Stage 9A implementation areas and map all budget/price coupling.
- [x] Agree on the compatibility boundary for removing local budget enforcement.
- [x] Review and approve an integration design covering Kimi, other OpenAI-compatible providers, Stage 9A, migrations, and tests.
- [ ] Implement the approved small diffs and integrate the reviewed Stage 9A commits.
- [ ] Run fresh independent verification, commit the result, and guide the first automated deployment run through dialogue.
