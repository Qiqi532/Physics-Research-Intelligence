# 进度日志

## 会话：2026-09-01（阶段 9A 实施）

### 9A：每日选择、独立收藏、30 天清理与个人收藏页
- **状态：** complete（6 个任务全部逐任务提交；9B/10/11 未启动）。
- 隔离 worktree：`D:\Physics Research Intelligence\.worktrees\stage-9-local-library`，分支 `codex/stage-9-local-library`，基线 `origin/main@9f846f4`；主工作区（尤其 `packages/ai` 的 Kimi K2.6 用户改动）全程未触碰。
- Task 1（`320588b`）：`UserPaperState.isFavorite/favoritedAt` + 第 6 条迁移 `20260901092205_add_user_paper_favorite`；收藏与阅读状态正交，旧值保留、未知字段拒绝、并发幂等。
- Task 2（`eb8e7e7`）：`PAPER_RETENTION_DAYS=30`、`DAILY_PAPER_TARGET_MIN=10`、`DAILY_PAPER_TARGET_MAX=15` 严格整数与 min<=max 不变式。
- Task 3（`b2bc809`）：确定性多样化 10–15 篇选择（`selectDailyPapers`/`buildDailySelection`），冷启动、兴趣命中、跨方向、确定性并列、窗口重跑稳定。
- Task 4（`c186924`）：`pruneExpiredPapers` 只删过期非收藏、级联清理、Today 后执行且清理失败可恢复；`retentionCutoffAt` 纯函数 + 接线断言绕过 workspace mock 限制。
- Task 5（`bdc2f3b`）：`/library` 个人收藏页（force-dynamic Server Component）、`LibraryPaperList`、`listFavorites`、首页“我的收藏”导航、`FavoritePaper` 导出补入 `@pri/db` index；组件/仓库 14+10 测试 + 4 条 e2e。
- Task 6（`157ef02`）：全量 Vitest **448 项 / 65 文件**、全量 typecheck 0、lint 0、Playwright 桌面+移动 **32/32**、Web/worker 生产构建 0、Prisma generate/validate/status 通过且 `migration_lock.toml` 无 diff；E2E schema 业务表 0 行、`_prisma_migrations` 6/6 保留；补齐计划遗漏的日程默认 `DAILY_PIPELINE_TIME=00:00`（Asia/Shanghai）。
- 文档：`task_plan.md`/`findings.md`/`progress.md`/`.env.example`/`README.md`/`docs/operations.md` 已更新。
- 未决：worktree 合回 `origin/main` 的方式（merge/PR）待用户确认；真实 Provider 首轮试运行与 30 篇人工评审仍为人工任务。

## 会话：2026-09-01（阶段 9 数据准备：顶刊语料下载）

### 顶刊语料准备（为 9B/10/11 的数据输入）
- **状态：** complete。
- 交付 `data/journal-corpus/`：45 篇顶刊物理论文全文语料（Science 9、PRL 12、Nature 8、Nature Communications 10、Nature Photonics 6），PDF 合计约 284 MB。
- 渠道：arXiv 官方 API 按 `jr:` 检索各期刊 + Crossref/OpenAlex 交叉核对的 Science 标题匹配；PDF 从 arXiv 官方端点下载，全部 45/45 通过 `%PDF` 签名、字节数与 SHA-256 独立复核。
- 合规边界：nature.com 有反爬且付费墙全文不入库（遵循项目既有决策），语料保存的是这些期刊论文可合法存储的 arXiv 全文；`pdfs/` 已加入 `.gitignore`，`manifest.json` 记录 DOI/期刊/标题/作者/摘要/SHA-256 作为权威事实层。
- 清理了检索/匹配的临时脚本与中间文件，保留 `query_arxiv.py`/`build_corpus.py`/`verify_corpus.py` 供复现。
- 未修改任何应用代码；本语料是阶段 9B（PDF 资产）、10（阅读助手）、11（RAG）的数据准备输入。

## 会话：2026-09-01（模型管理发布与阶段 9 交接）

### 模型管理发布恢复
- **状态：** complete。
- 在修改前建立并推送 Git 备份 `backup/main-before-stage8-20260901@e355a1d`，并创建可列出恢复内容的 PostgreSQL custom-format 备份 `backups/pri-before-stage8-main-20260901-100127.dump`。
- 将 `codex/stage-8-model-console` 纯快进到本地 `main`，部署缺失的第 4、5 条迁移，再以普通快进推送到 `origin/main`。
- 新增从 Today 首页进入模型管理台的正式 Playwright 回归；提交与远端 `main` 均为 `35faeadec3e9f01b68131dc50db4dc771f31956b`。
- 本地生产 Web 运行于 `http://127.0.0.1:3000`；`/api/health/live` 与 `/api/health/ready` 均为 200。

### 最新验证证据
- Vitest：61 个文件、385 项通过。
- Playwright：桌面与移动合计 24/24，通过新增首页导航、模型管理、Today、论文详情、恢复和可访问性边界。
- lint、全仓 typecheck、Web standalone 与 worker 生产构建全部退出码 0；standalone 静态资源复制成功。
- Prisma generate、validate、migrate deploy、migrate status 通过；`public` 与专用 schema 均识别 5 条迁移。
- 真实 3000 生产页 Chromium 检查：桌面/移动入口可见、跳转与标题成功、首个焦点为 skip link、横向溢出为 0。
- E2E teardown 后论文、模型连接、任务路由、兴趣和来源游标计数均为 0；Playwright 报告与测试产物已删除。
- 应用内浏览器连接器因桌面运行目录缺失无法初始化；项目正式 Playwright 和仓库内 Chromium 已完成等价页面验证，并保留该工具限制说明。

### 阶段 9 计划交接
- 用户批准普通论文 30 天、收藏长期保留、明确开放许可 PDF 自动保存及合法个人 PDF 手动导入边界。
- 新建 `docs/superpowers/plans/2026-09-01-local-library-ai-reading-roadmap.md`，把工作拆为 9A 每日/收藏/清理、9B PDF 资产、10 阅读助手、11 收藏库 RAG。
- 根 `task_plan.md` 已把阶段 8 修正为 complete，并把阶段 9 标记为 planned。
- 下一次对话从最新 `origin/main` 新建 `codex/stage-9-local-library` 独立 worktree，先写收藏状态失败测试；不得在同一差异中提前实现 9B、10 或 11。

## 会话：2026-08-31（阶段 8 实施）

### Task 6–8：模型管理台、正式 E2E 与发布门禁
- **状态：** complete（本地实现与验证）；最终文档提交和远端 push 待执行。
- 管理台组件红灯因模块不存在准确失败；实现 `/settings/models`、公开页面状态、多命名连接列表、官方 preset、编辑/复制/删除、空 Key 保留、Key 轮换、连接/合成样本测试和四路任务路由后，2 文件 9 项转绿。
- 首轮真实 E2E 暴露 Next 内部 hostname 规范化导致合法 127.0.0.1 写请求被拒绝；新增同源回归红灯并改为比较 HTTP Host 后，13 项请求边界测试通过。
- E2E 又暴露结构化鉴权失败被页面误报成功；页面同时判断 `result.status` 后，鉴权错误显示安全 API Key 提示。loopback mock 只监听 127.0.0.1:3211，不代理外部网络。
- 模型管理台 Playwright 桌面 3/3、移动 3/3 定向通过；完整 Playwright 桌面/移动共 22/22 通过，覆盖命名连接、空 Key 保留、复制清 Key、鉴权、冷却、合成样本、主备路由、引用删除保护、焦点与无横向溢出。
- 运维文档红灯准确缺少 localhost 页面、LAN 只读、主密钥分离备份/恢复和丢失恢复；补齐后文档 5/5 通过。
- 本地审查发现真实主密钥错误码未映射为可恢复文案；回归红灯后分别增加检查密钥文件和重新填写 Key 提示。复审无剩余严重或警告级问题。
- 最终 Vitest/PostgreSQL 61 文件、385 项通过；Prisma generate/validate/status 通过，`pri_stage7_test` 与 `pri_stage5_e2e` 均为 5 条迁移且 Paper/PaperSource/UserInterest/AiConnectionProfile/AiRuntimeRouting 计数全为 0。
- 全仓 lint、typecheck、Web standalone 与 worker production build 通过；standalone server、静态资源和 worker dist 均存在，验证后已清理构建与 Playwright 产物。
- 应用内浏览器控制仍因 Windows 本地运行时路径初始化故障不可用；同一 Chromium Playwright 已完成真实桌面/窄屏交互，stage-8 开发页另启动于 `http://127.0.0.1:3220/settings/models` 供可见审查。
- 本轮没有使用真实 Provider Key、调用真实模型/论文 API、读取 `.env` 内容或接触生产数据库；真实小额 Provider 测试与 30 篇人工质量评审继续保留为人工任务。

### Task 0–1：隔离 worktree、领域校验与加密
- **状态：** complete。
- 已推送设计/计划基线，并从 `bdc6db5` 创建独立 `codex/stage-8-model-console` worktree；原 main、stage-6 和其他 worktree 未修改。
- 新 worktree 使用 `pnpm install --offline --frozen-lockfile` 从本机 store 恢复 584 个锁定依赖，下载数为 0，锁文件未变化。
- 首次 Task 1 测试在 pretest 阶段因新 worktree 没有 `DATABASE_URL` 安全失败，未加载测试；改用进程级专用 loopback test schema 后，红灯准确为 `model-settings` 与 `model-settings-crypto` 模块不存在。
- 最小实现新增 strict 连接/路由 schema：16 KiB、50 配置、字段长度、数值、未知字段、HTTPS/loopback HTTP 和空更新 Key 边界。
- AES-256-GCM 使用 32 字节独立主密钥、12 字节随机 nonce、16 字节 tag，并用版本/Profile UUID/provider 作为 associated data；decrypt 缺 key 不会自动生成替代 key。
- 定向测试 2 文件、26 项全部通过；`@pri/domain` 与 `@pri/db` typecheck 均退出 0。

### Task 2：Prisma 模型、迁移与仓储
- **状态：** complete，待独立提交。
- 红灯准确为两个仓储测试均无法导入尚不存在的 `model-settings-repository`；集成测试在红灯阶段未连接数据库。
- Prisma 在专用 `pri_stage7_test` schema 生成并应用第 5 条迁移 `20260831122603_model_connection_console`；人工核对 SQL 只新增两个表、一个唯一约束、一个索引和四个 `RESTRICT` 外键。
- 仓储只保存密文并按 `userId` 隔离；路由替换在事务内校验全部配置归属，稳定映射同名、使用中和不存在错误。
- 首次类型检查红灯定位为 Node `Buffer<ArrayBufferLike>` 与 Prisma 7 `Bytes` 的普通 `ArrayBuffer` 类型不兼容；在 Prisma 写入边界复制为新 `Uint8Array` 后恢复绿灯，未使用类型断言。
- `@pri/db` typecheck 通过；仓储单元与 PostgreSQL 集成测试 2 文件、9 项通过；teardown 后两个新业务表均为 0，迁移历史保留 5 条。
- 只读清理核验首次误用了不存在的 `pri-postgres` 容器名；列出实际容器后改用 `infra-postgres-1`，数据库与测试本身未失败。

### Task 3：单连接 provider 与两级测试运行器
- **状态：** complete，待独立提交。
- 单连接工厂红灯准确为 `connection-provider` 模块不存在；最小实现提取旧 factory 的八分支 switch，旧环境配置工厂继续复用同一逻辑。
- 健康/样本红灯准确为 `connection-test` 模块不存在；健康结果只暴露状态、provider/model、耗时和稳定错误码。
- 虚构样本固定使用项目自有标题与摘要，分类和解读通过 `Promise.allSettled` 并行执行，一项失败仍返回另一项结果；不写数据库且不进入每日预算。
- Task 3 定向测试 4 文件、36 项通过，`@pri/ai` typecheck 退出 0；全部 provider HTTP 使用 mock fetch，无真实 API 请求。

### Task 4：安全内部 API
- **状态：** complete，待独立提交。
- 请求工具红灯先因测试引号传输产生语法错误，修正测试后有效红灯准确为模块不存在；最终同源、LAN、JSON、声明/流式 16 KiB 上限和无效 body 共 12 项通过。
- service 红灯准确为模块不存在；实现显式公开 DTO、50 配置上限、预生成 UUID 加密、空 Key 保留、Key 轮换、换供应商强制新 Key、主备不同供应商、稳定错误和 5/60 秒测试冷却。
- AES associated data 需要写入前已知 profile UUID；新增仓储回归先失败于数据库生成了不同 ID，再最小扩展 create 的可选预生成 ID，原调用兼容。
- Route Handler 红灯准确为目标路由不存在；首次 mock 重跑暴露 Vitest hoist 顺序，第二次暴露根配置缺少 Web `@` alias；分别按官方 hoisted mock 和与 Web tsconfig 一致的 alias 修复。
- 配置回归发现空 `AI_SETTINGS_MASTER_KEY_FILE=` 仍以 undefined 属性返回；组装 ServerConfig 时显式省略后转绿，配置层只返回非空路径且不读取内容。
- 本地审查因 CodeRabbit CLI 未安装未上传代码；3 个警告级问题均先加红灯并修复：非法路径 UUID、routing 内部 userId/Date 投影、URL 嵌入式凭证。
- 最终定向门禁 6 文件、61 项通过；domain/db/web typecheck、Web lint 与 `git diff --check` 均退出 0。专用 schema 两个新业务表为 0，迁移历史保留 5 条。

### Task 5：Worker 任务级快照与热切换
- **状态：** complete，待独立提交。
- resolver 红灯准确为模块不存在；持久化路由优先、环境仅在无路由时使用，不完整路由、读取失败和解密失败使用稳定 worker 错误码且不回退。
- 运行时类型允许分类 Kimi 配置 A 与解读 Kimi 配置 B；任务内部主备仍校验不同供应商，持久化默认输出上限为 1000/4000。
- 批次红灯准确复现旧 processor 在构造时因 `config.AI` 缺失直接抛错；改造后每次 `process()` resolve 一次，批次内多论文共享 provider，下一批次读取新配置。
- 分类与解读各自构造 provider 价格表；回归使用同一 Kimi 供应商的不同单价，确认不会因供应商键相同互相覆盖。
- 首轮热切换测试唯一失败是 Vitest 模块代理未记录无关的 disconnect mock 次数；保留 `await close()` 生命周期执行，移除脆弱计数断言。随后类型检查发现价格返回类型过宽，复用现有 `ProviderPrices` 后转绿。
- LAN 标记与动态日志错误码均先红灯；默认/局域网启动分别写 `PRI_LAN_MODE=false/true`，resolver 配置错误在 `worker.daily` 日志使用自身稳定 code，其他错误保持 `daily_pipeline_failed`。
- 最终定向门禁 5 文件、19 项通过，worker/Web typecheck 与 `git diff --check` 均退出 0；无真实数据库查询、来源请求或模型请求。

## 会话：2026-08-31（阶段 8）

### 页面内模型连接管理台设计
- **状态：** complete，书面规格已由用户明确通过，详细 TDD 实施计划已完成。
- 已核对现有八类 provider、统一 provider contract、环境配置、worker 批次构造和 Prisma 模型。
- 用户确认采用本机加密保存，允许同一供应商多个命名配置，采用连接检查与分类/解读示例两级测试，并要求新任务立即生效、运行中任务保持旧快照。
- 比较数据库密文、加密 JSON 和页面写 `.env` 三种方案后，批准数据库密文加仓库外本机主密钥；现有 `.env` 只作为无持久化路由时的兼容回退。
- 架构、安全、恢复、API、错误、TDD 和 E2E 边界均已逐段通过。
- 可视化稿提供管理台与分步向导两种布局；用户选择管理台，浏览器点击事件为 `choice: a`。临时服务已停止，临时目录已清理。
- 读取代码时两处旧路径不存在，改为先列出现有文件再读取；未写产品代码。首次长参数线框稿补丁未生成文件，改用较小直接补丁成功，错误与解决方案已记录在 findings。
- 新增正式规格 `docs/superpowers/specs/2026-08-31-model-connection-console-design.md`；本次只提交设计与计划记录，不开始实现。
- 首次暂存门禁发现规格头部两行 Markdown 尾随空格，提交在创建前停止；移除空格后重新执行 `git diff --cached --check`。
- 实施计划类型复核发现全局 `AiServerConfig.providers` 会覆盖跨任务的同供应商不同命名连接；规格已修正为任务级运行时快照，保持用户批准行为不变。
- 使用 writing-plans 技能生成 `docs/superpowers/plans/2026-08-31-model-connection-console.md`：Task 0–8 共 57 个勾选步骤，覆盖隔离 worktree、加密、迁移、仓储、provider 测试、API、worker 热切换、管理台、E2E、运维与发布。
- 计划自审无占位符，AES-GCM、同供应商多配置、两级测试、LAN、任务级快照、Playwright、主密钥恢复、环境回退和热切换覆盖项全部存在。用户已要求继续开发且不逐步等待，因此采用当前会话内联执行；不启用子代理。

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

## 会话：2026-09-01（双语 README 与 Kimi 摘要试运行）

- **状态：** in_progress
- 已批准设计与实施计划，选择在当前对话内执行。
- 已为双语 README 增加文档契约测试。
- 首次定向测试在业务断言前失败：根 `pretest` 加载 Prisma 配置时缺少进程级 `DATABASE_URL`。根因是生成步骤的环境前置条件，文档测试本身不访问数据库；下一次执行将只注入虚构的本地 PostgreSQL URL用于 Prisma 客户端生成，不读取 `.env` 或连接数据库。
- 第二次定向测试已通过 Prisma 生成，但 Vitest/Vite 加载配置时在 Windows 路径解析子进程处返回 `spawn EPERM`；根因是沙箱子进程权限边界，尚未进入 README 断言。下一次以同一精确命令请求受限环境外执行。
- 首次语料 README 安全措辞补丁因预期上下文少了原文中的“个人研读”而未应用；读取精确段落后改用更小上下文补丁，未重复失败操作。
- 双语 README 文档测试 11/11 通过并提交；45 条 journal manifest 与 PDF Git 忽略边界测试 7/7 通过并提交。
- journal-corpus 严格解析器、幂等导入器和最多三篇的 Kimi 摘要试运行 CLI 已完成 TDD；最终定向组 8 个文件、32 项通过，worker 类型检查通过。本地安全审查修复了“未限制最大付费批量”的 Warning，复审无剩余 Critical/Warning。
- 发布前全量门禁检查发现 Docker Desktop 引擎未运行，5432/6379 均未监听，`com.docker.service` 为 Stopped；因此 PostgreSQL 集成测试尚未执行，需用户启动 Docker Desktop 后继续。未读取 `.env` 或连接个人数据库。
- 用户启动 Docker Desktop 后，PostgreSQL 17 与 Redis 7 均为 healthy 且只监听 loopback；Docker Server 版本为 29.7.2。
- 在全新 `pri_kimi_trial_test_20260901` schema 部署 5 条现有迁移；完整 Vitest 为 64 个文件、396 项全部通过。测试后 Paper/PaperSource/AiRun/AiRunAttempt/AiConnectionProfile/AiRuntimeRouting 均为 0，PhysicsTag 为 9，迁移历史为 5。
- 全仓 lint、全仓 typecheck、Web Next.js 16.3.3 与 worker 生产构建退出码均为 0；构建期间设置 `NEXT_TELEMETRY_DISABLED=1`，未连接真实模型或论文来源。
## 2026-09-01 — LLM compatibility and Stage 9A continuation

- Located the completed Stage 9A worktree and confirmed its branch/commit lineage relative to `main`.
- Reviewed the Stage 9A summary plus key configuration, selection, cleanup, favorite-state, repository, UI, and test diffs without modifying product code.
- Mapped the existing budget/price gate across runtime, database, settings UI, tests, and documentation.
- Next: agree on the exact removal boundary, write the integration design, then review/fix/verify Stage 9A and finish the Kimi changes as reviewable commits.
- User approved removing cost data and calculations entirely, while retaining only provider-reported token usage.
- Local Stage 9A review identified concurrent state overwrite and missing bounded configuration validation as issues requiring fixes before merge.
- The first targeted Vitest command did not start because the isolated worktree has no dependency links; no test result was inferred from that environment failure.
- A first attempt to append these notes used an invalid patch hunk; it made no changes, and the corrected patch succeeded.
- A guessed `packages/ai/src/contracts.ts` path did not exist; repository search located the actual contract in `packages/ai/src/provider.ts` before planning further changes.
- The approved design and two implementation plans were recorded; inline execution is used because the user asked to start and did not request sub-agent delegation.
- Stage 9A targeted logic tests passed 82/82 before fixes and 45/45 after the review fixes.
- The first dedicated-schema database attempt used an invalid example password and did not apply migrations; the retry loaded the existing root `.env` connection without printing it, applied all six migrations to `pri_stage9a_review`, and passed 27/27 PostgreSQL tests.
- The first worktree typecheck lacked `DATABASE_URL` during Prisma generation; process-local injection from the root `.env` fixed the prerequisite, after which full typecheck and lint passed.
- Stage 9A review fixes were committed as `9d33ef9`; Kimi K2.6 compatibility and trial evidence were committed on `main` as `2fae6e0`.
- `main` was merged into `codex/stage-9-local-library` as `dc8a60b`, preserving both Stage 9A and Kimi history without squashing review evidence.
- Implemented the approved no-cost boundary across provider contracts, worker jobs, runtime configuration, model settings, Prisma schema/repository, UI, tests, README, operations, and trial documentation.
- Targeted verification after the implementation passed 136 tests with 12 database-dependent skips; all seven workspace package typechecks passed.
- Added explicit regression coverage for successful responses without provider usage and nullable aggregate token audit data.
- Two repository search commands had malformed regular expressions and one large documentation patch missed its context; none changed files, and the checks/edits were split into exact smaller operations.
- Incremental migration from the six-migration Stage 9A schema to the no-cost schema passed; a fresh schema also applied all seven migrations successfully.
- Final verification passed: 63 Vitest files / 442 tests, 12 database files / 53 tests, full lint, all workspace typechecks, Web and worker production builds, and 32 desktop/mobile Playwright tests.
- The first full E2E run exposed two obsolete price-field locators; removing those locators produced 8/8 targeted and 32/32 full E2E passes. An earlier ad-hoc root Playwright binary caused a duplicate-version collection error and executed no tests; the project script was used instead.
- The verified branch was fast-forwarded into local `main` at `7338bb6`; unrelated untracked corpus and workspace files remained untouched.
- Before migrating `public`, a Git-ignored custom-format backup was created and validated with 1102 TOC entries. The Stage 9A favorite migration and no-cost migration then applied successfully; the primary database reports all seven migrations current, zero obsolete cost columns, and one `isFavorite` column.
- Post-migration runtime verification returned HTTP 200 for liveness and readiness. The browser loaded Today, the model console, the empty favorites library, and a real Kimi-interpreted paper; the model console retained Kimi K2.6 routing and exposed no price or budget controls.
