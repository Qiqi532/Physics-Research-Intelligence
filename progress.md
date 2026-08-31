# 进度日志

## 会话：2026-08-31（阶段 8）

### 页面内模型连接管理台设计
- **状态：** in_progress，完整设计已获对话批准，等待书面规格复核。
- 已核对现有八类 provider、统一 provider contract、环境配置、worker 批次构造和 Prisma 模型。
- 用户确认采用本机加密保存，允许同一供应商多个命名配置，采用连接检查与分类/解读示例两级测试，并要求新任务立即生效、运行中任务保持旧快照。
- 比较数据库密文、加密 JSON 和页面写 `.env` 三种方案后，批准数据库密文加仓库外本机主密钥；现有 `.env` 只作为无持久化路由时的兼容回退。
- 架构、安全、恢复、API、错误、TDD 和 E2E 边界均已逐段通过。
- 可视化稿提供管理台与分步向导两种布局；用户选择管理台，浏览器点击事件为 `choice: a`。临时服务已停止，临时目录已清理。
- 读取代码时两处旧路径不存在，改为先列出现有文件再读取；未写产品代码。首次长参数线框稿补丁未生成文件，改用较小直接补丁成功，错误与解决方案已记录在 findings。
- 新增正式规格 `docs/superpowers/specs/2026-08-31-model-connection-console-design.md`；本次只提交设计与计划记录，不开始实现。
- 首次暂存门禁发现规格头部两行 Markdown 尾随空格，提交在创建前停止；移除空格后重新执行 `git diff --cached --check`。

## 会话：2026-08-31（阶段 7）

### 零成本本地真实数据试运行
- **状态：** complete，实现、验证、清理、审查与分支发布均已完成；30 篇人工内容评审不虚构结果，保留为人工任务。
- 历史分支审计确认本地与远端 stage-2、stage-3、stage-4、stage-5、集成分支和备份分支全部已合并进 `origin/main@64115e7`，`--no-merged origin/main` 为空。
- 从 `origin/main@64115e7` 创建独立 `codex/stage-6-local-trial` 工作树；未触碰保存项目目录的旧 main 或其他 worktree。
- 用户确认电脑端访问为最低要求；手机/平板仅在实现简单且安全边界明确时加入。
- 已批准方向为默认 localhost、显式可信 LAN、九方向官方开放论文、PDF 本地忽略、manifest 可追溯、现有仓储幂等导入、无 Key 可用页面。
- 用户已明确回复“规格通过”；新增 `docs/superpowers/plans/2026-08-31-local-real-data-trial.md`，按清单内联执行，不启用子代理且不再逐项等待确认。
- 计划自检发现规格覆盖清单误将现有 `condensed-matter-materials` 拆成两项并漏掉 `statistical-computational`；已按仓库真实九标签修正文档，不新增标签或迁移。
- Task 1 红灯：`tests/worker/review-corpus-manifest.test.ts` 因 manifest 模块不存在失败；最小实现后 10/10 通过。首次 worker typecheck 同时发现新增集合推断错误与未生成 Prisma 客户端的级联错误；修正集合类型并使用虚构本地 URL 执行 Prisma generate 后，worker typecheck 退出码 0。
- Task 2 红灯：downloader 模块不存在；首轮最小实现后 downloader/来源重试共 14 项中 13 项通过，唯一失败为已有文件长度不符错误码不稳定。将已有文件的签名、长度、checksum 不符统一映射为 `existing_file_mismatch` 后 14/14 通过，worker typecheck 退出码 0；测试全程使用 mock fetch 和系统临时目录。
- Task 3 红灯：importer 模块不存在；最小仓储实现后单元测试 2/2 通过。新建 `pri_stage7_test` 专用 schema 并应用四条既有迁移，单元+PostgreSQL 重放集成共 3/3 通过；同一九条 manifest 重放保持 9 个 Paper/9 个 PaperSource，teardown 后业务计数 0/0、迁移历史 4。
- Task 4 红灯：local-trial 文档测试 3/3 因命令、manifest、README/ignore 边界缺失而失败；实现后定向四文件 24/24 通过，worker typecheck 退出码 0。
- 通过 arXiv 官方 API 限速选择并核对 `2608.28486`、`2608.28583`、`2608.28449`、`2608.28297`、`2608.28434`、`2608.28483`、`2608.28468`、`2608.27711`、`2608.27681`。标题、作者、摘要二次对照为 9/9 完全一致；API 未提供显式许可 URL，manifest 如实保存 `null`。
- 九份官方 PDF 共 56,035,415 bytes，签名、Content-Type、大小与 SHA-256 全部验证；正式 downloader 连续两次均报告 9 个 `verified`，PDF 目录由 Git 忽略且无 `.bootstrap`/`.partial` 残留。
- Task 5 红灯：local-trial 5 项中 2 项因启动器和本地说明缺失失败；新增无依赖 Web 包装器后，本地/运维测试 9/9、Web typecheck、Web lint 全部通过。默认 `dev/start` 固定 `127.0.0.1`，只有显式 `dev:lan/start:lan` 使用 `0.0.0.0` 并打印 no-login 警告。
- Task 6 先新增 `backups/` 忽略红灯，local-trial 5 项中 1 项失败；补规则后 5/5 通过。创建 `pri-before-stage7-loopback-20260831-041740.dump`（252,159 bytes，SHA-256 `660b11825cecc22a4923c8304fae907333989be8a6a7490ebfd42cce13f49726`），`pg_restore --list` 可读；备份留在忽略目录。
- 仅重建 `infra` 项目的 PostgreSQL/Redis 并保留命名卷；两者恢复 healthy，实际监听从旧 `0.0.0.0` 收紧为 `127.0.0.1:5432/6379`。
- 初版九篇最新 arXiv 记录没有 DOI，真实浏览器暴露现有 DOI 路由无法进入站内详情。未伪造 DOI或改写接口，改选九篇 arXiv API 明确给出 DOI 的同方向开放论文；正式 manifest 为 `2608.23596`、`2608.28268`、`2608.28201`、`2608.25074`、`2608.28388`、`2608.19267`、`2608.14137`、`2606.13047`、`2608.08919`，标题/作者/摘要/DOI 9/9 与官方 API 完全一致且 PDF 全部 verified。旧九份已验证 PDF 仍在忽略目录，作为额外人工材料，不导入数据库。
- `pri_stage7_trial` 应用四条既有迁移；清理本阶段旧无 DOI 试运行数据后，新清单连续导入两次均成功且保持 9 Paper/9 PaperSource、0 classification、0 interpretation。
- 浏览器发现详情页未展示已存公开摘要：新增组件测试红灯（模块不存在），最小 Server Component 与原有样式接入后组件/响应式 8/8 通过。真实详情公开摘要 1,341 字符可见，“尚无 AI 解读”如实披露。
- 真实桌面检查：首页有 8 篇近期站内推荐和来源链接；Tab 首焦点为可见 skip link 且 outline=solid；稍后读、正在阅读、完成、不感兴趣四状态均成功，随后恢复未读；兴趣保存天体权重 2 成功并恢复九项默认权重 1。因 0 classification，冷启动排序按设计保持稳定，未虚构兴趣命中。
- 应用内浏览器控制连续三次因 Windows sandbox workspace refresh helper 退出，未能获取可控标签页；改用仓库锁定 Playwright 完成真实桌面/390px 验收。390px 首页和兴趣页均无横向溢出、主要控件可见。
- trusted-LAN production 模式打印 no-login 警告，候选 `http://172.17.49.138:3000` 本机访问 200；监听为 Web `0.0.0.0:3000`、PostgreSQL/Redis `127.0.0.1`。验收后立即停止 LAN 并恢复 production Web `http://127.0.0.1:3000`。
- 首次设计提交前 `git diff --cached --check` 报告两处 Markdown 尾随空格和一个末尾空行，但 PowerShell 命令链未因非零退出停止，仍创建了 `667c8a6`；不 amend，改用独立格式修复提交，并要求后续门禁显式检查退出码。
- 完整 Vitest 使用 `pri_stage7_test` 专用 schema：48 个文件、289 项全部通过；完整 Playwright 使用 `pri_stage5_e2e` 专用 schema：桌面 8/8、移动 8/8，共 16/16 通过，测试后两个 schema 的 Paper/PaperSource/UserInterest 均为 0/0/0。
- Playwright 首轮在新增公开摘要后为 10 通过、2 失败、4 跳过：同一摘要同时出现在双语概述与公开摘要区，旧全页文本定位不再唯一。将断言分别约束到 `.bilingual-overview` 和 `.public-abstract` 后全量 16/16 转绿，产品代码无需改动。
- Prisma generate、validate 和 migration status 均通过，`pri_stage7_trial` 的 4 条迁移最新；全仓 lint、typecheck、Next.js 生产构建、worker 生产构建及 standalone `.next/static` 复制全部通过。仓库无 `public` 源目录，因此没有公共资源需要复制。
- 本地代码审查覆盖路径穿越、URL/redirect 白名单、大小上限、PDF 签名与 SHA-256、并发落盘、幂等导入、脱敏日志、数据库边界和 LAN 暴露，未发现严重或警告级问题。CodeRabbit CLI 未安装，未安装或上传源码；npm 官方审计为 0 个已知漏洞。
- 验证期间 Codex 执行器再次遇到 workspace refresh helper 故障；只读与验证命令改走获批的独立 worktree 边界，未触碰其他 worktree 或分支。Prisma 首次临时环境变量未被 `cmd` 子进程继承，在加载配置前安全失败；改用进程级 PowerShell 变量后通过。

## 会话：2026-08-30（阶段 6）

### 全仓审查、可回退合并与后续交接
- **状态：** complete
- 已确认 `codex/stage-5` 工作树干净且与 `origin/codex/stage-5` 同步，当前提交为 `49e163e57f8bf4fbfa8816490a49842145cea759`。
- 已确认保存项目目录的 `main` 工作树仍含用户未提交内容；本阶段不在该工作树执行 checkout、清理或合并。
- 计划先刷新远端并完成全仓审查与全量复验，再建立合并前备份分支，最后在新独立工作树完成可追溯合并。
- 远端图确认 `origin/main@6101ea5` 是 stage-5 祖先，分支计数为 0/3，无双向分叉；CodeRabbit CLI 未安装，因此未安装、登录或上传代码。
- 本地全仓审查发现并修复两个 Warning：Prisma 配置链的 `deepmerge-ts@7.1.5` 高危公告，以及部署环境未显式禁用 Next.js 匿名遥测。
- 依赖修复红灯为官方审计 1 个 high；pnpm 11 workspace override 到 8.0.0 后 `pnpm why` 只解析 8.0.0，官方审计为 0，Prisma generate/validate 通过。
- 遥测修复红灯为文档测试 4 项中 1 项失败；补充 `NEXT_TELEMETRY_DISABLED=1` 后 4/4 通过，Web 生产构建不再输出遥测提示。
- 全量 Vitest 使用新 `pri_stage6_test` schema 应用 4 条既有迁移，43 个文件、259 项通过；Playwright 状态为 passed、失败用例为空，桌面/移动共 16 项。
- 全仓 lint、typecheck、Web standalone 与 worker 生产构建通过；新增根 README 汇总能力、部署建议、用户事项、后续优先级和已知限制。
- 2026-08-31 上海午夜复跑 Playwright 发现 Today 统计 14/16：fixture 的 10 分钟至 4 小时回退跨日后不再属于“今天”。以失败的桌面/移动断言为红灯，改为当前上海日内的稳定发布时间后定向 4/4、全量 16/16 通过。
- Next 16 smooth-scroll 声明测试先 1/2 失败；按本地官方文档为根 `html` 增加 `data-scroll-behavior="smooth"` 后 2/2、Web typecheck/lint 通过，E2E 不再出现该框架警告。
- 首次全量测试后 `pri_stage6_test` 仍有 1 篇 Paper 和 1 条 SourceSyncState，作为 teardown 红灯；为四个 PostgreSQL 集成测试补齐 `afterAll` 后，全量 43 文件、261 项通过，九张业务表均为 0，9 个标签种子与 4 条迁移保留。
- 进度证据补丁曾因跨文件上下文错误只应用了前置 task_plan 勾选；核对三份文件后以小上下文补齐 findings/progress，未覆盖其他内容。
- 合并前远端备份 `codex/backup-main-before-stage5-20260831` 已推送并核验为 `6101ea5b200af3397fe2c63cc92ba62dde8e06c9`。
- 独立 `codex/integrate-stage-5` 工作树从 `origin/main@6101ea5` 创建，以 `--no-ff` 合并 `codex/stage-5@75623bf`；合并提交 `a68b5eaca74ef0672384216643b5dfb6850332b8` 有两个正确父提交且无冲突。
- 合并树使用离线锁文件安装（下载 0）和新 `pri_stage6_merge` schema：43 文件 261 项 Vitest、16 项 Playwright、lint、typecheck、Prisma generate/validate/status、Web/worker build 与官方依赖审计全部通过。
- 合并树的 `pri_stage6_merge` 与 `pri_stage5_e2e` 业务计数均为 0，迁移历史各保留 4 条；构建与 Playwright 产物已清理。
- `codex/integrate-stage-5` 已先推送为独立恢复分支，再以普通非强制推送将远端 `main` 从 `6101ea5` 更新到已验证审计点 `81cdcbc`；远端核验分支计数为 0/0。
- 保存项目目录的本地 `main@e355a1d` 因含用户未跟踪内容仍未移动；远端合并完成不覆盖该工作区，后续应先保存用户内容再选择安全同步方式。

## 会话：2026-08-30（阶段 5）

### 产品补全、可靠性、自动运行与部署准备
- **状态：** in_progress
- 已完成：
  - 检查主工作区 Git 状态、所有现有 worktree、基线提交与规划文件；确认主工作区用户内容不进入阶段 5。
  - 逐份完整阅读两份指定设计规格和三份指定实施计划。
  - 从 `72aa2ec98cb2e02b852f74117ad563a8e69d2e72` 创建 `codex/stage-5` 与独立 worktree，初始状态干净。
  - 核对 Prisma、Today 推荐、来源游标/重试、AI 幂等/预算、worker 入口、standalone 构建和测试清单。
  - 写入 `docs/superpowers/plans/2026-08-30-stage-5-reliability-deployment.md`，确定按兴趣、调度、健康、E2E、运维、审查七个 TDD 任务推进。
- 尚未运行任何真实来源、AI、生产数据库或云服务。
- 错误记录：本地执行器初始化失败 2 次后改用审批边界；一次批量文档输出截断后改为逐文件读取；补丁刷新故障后改用内建补丁模式。

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

## 会话：2026-08-30（阶段 5）

### 产品补全、可靠性、自动运行与部署准备
- **状态：** in_progress，功能实现完成，最终全量验证、审查、清理和提交待执行。
- 工作区：`D:\Physics Research Intelligence\.worktrees\stage-5`，分支 `codex/stage-5`，基线 `72aa2ec98cb2e02b852f74117ad563a8e69d2e72`；未修改其他工作区或分支。
- 兴趣设置：新增严格领域 schema、事务仓储、GET/PUT 内部 API、Server Component 页面与最小 Client 表单；覆盖加载、保存中、成功、错误、无标签、取消单项/全部及默认恢复。
- 正式 E2E：新增 Playwright desktop Chromium 与 Pixel 7 项目、专用 `pri_stage5_e2e` schema、可重复 fixture、外部网络阻断、数据库故障恢复和 teardown 清理。
- 自动运行：新增 BullMQ queue/worker/scheduler、Asia/Shanghai 可配计划、稳定 scheduler ID、Redis 有界重连、来源窗口重放保护；每日顺序为采集、分类、预算内解读、Today 准备。
- 可靠性：新增 live/ready 健康端点，安全检查 PostgreSQL、Redis、queue backlog 和 worker；新增结构化 worker 日志并移除日志安全对象中的内部 stack。
- 模型接入：新增 GLM、Kimi、混元命名 adapter 与通用 OpenAI-compatible 入口；单一命名 API Key 可自动配置，多 Key 强制显式默认；全部测试只用 mock fetch。
- 运维：新增安全 `.env.example`、个人部署/停止/健康/备份恢复/排障/升级说明，以及包含 30 个空白跨方向槽位的人工质量评审 rubric。

### TDD 红绿记录
- 兴趣领域/仓储/API/UI 先红后绿：定向 4 个文件、25 项通过；domain/db/web 类型检查通过。
- scheduler/config 红绿：fake timer、时区、稳定 upsert/disable、日窗口共 4 个文件、28 项通过；queue/ingest/db 幂等与重连 3 个文件、12 项通过。
- worker runtime 与健康/日志红绿：运行时 3 个文件、13 项通过；健康与初始日志 2 个文件、7 项通过。
- Provider 自动配置红灯：2 个文件 10 项按预期失败；最小实现后配置/工厂 21/21 通过，新增 mock HTTP 契约 17/17 通过。
- 自动深度解读红灯：流水线/仓储 3 项按预期失败；实现后 7/7 通过，worker/db 类型检查通过。
- 日志 stack 红灯准确显示唯一多余字段；移除后配置测试 16/16 通过。每日操作日志 2 项红灯后，日志测试 3/3 通过。
- Playwright 论文详情 3/3 通过；桌面全组首次 7/8，通过快照定位到页面未稳定即按 Tab，增加业务标题等待后单项焦点回归通过。
- 文档结构回归 3/3 通过，确认 30 行模板、关键运维章节和所有 Provider Key 样例为空。

### 当前错误与处理
- pnpm 请求 BullMQ 6.3.2 时确认仓库最新稳定为 6.3.1，固定实际可用版本；可选原生 `msgpackr-extract` 构建脚本保持禁用。
- 端口 3100 已被其他阶段 standalone 服务占用，未终止或修改该进程；stage-5 E2E 改用 3210。
- 两个 Next dev server 会争用同一 `.next/dev` 锁，Playwright 改为单服务、两个设备项目串行复用。
- 初次桌面焦点测试在 RSC 主体稳定前按 Tab；失败快照仅含 skip link，等待“个性推荐”渲染后回归通过。
- 数据库故障 E2E 暴露 Prisma stack 会进入服务器日志；新增红灯并从统一日志安全投影中移除 stack。

### 最终验证与审查证据
- 完整 Vitest（含 PostgreSQL 集成）：43 个文件、259 项通过；随后 `pri_stage5_test` 业务计数为 0/0/0，迁移历史保留 4 条。
- 完整 Playwright：desktop Chromium 8/8、Pixel 7 mobile Chromium 8/8，共 16/16 通过；`pri_stage5_e2e` 业务计数为 0/0/0。
- 全仓 lint 与 typecheck 退出码 0；Web Next.js 16.3.3 standalone 与 worker 生产构建退出码 0。
- standalone server、standalone `.next/static` 与 worker `dist/index.js` 构建后均存在；验证后已删除 `.next`、`dist`、Playwright 输出和 tsbuildinfo。
- Prisma 7.10.0 generate/validate/migration status 通过；专用 schema 4 条既有迁移全部 up to date，无 Prisma schema 或历史迁移变化。
- Compose 静态展开确认仓库配置把 PostgreSQL/Redis 绑定到 `127.0.0.1`；当前运行的旧容器虽健康但仍保留历史的全网卡端口绑定，未擅自重建共享本地服务，部署时需人工重建。
- CodeRabbit CLI 未安装；未安装、登录或上传差异。完整本地 Critical/Warning 审查发现 1 个 Warning：重试时滚动 24 小时窗口会重复请求来源。经红灯修复为基于本地计划日的 DST 安全固定窗口，调度/采集/流水线 18/18 与 DST 单测 10/10 通过；复审无剩余 Critical/Warning。
- 本轮没有读取 `.env`、调用真实论文/AI API、访问生产数据库或下载受限全文。

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
