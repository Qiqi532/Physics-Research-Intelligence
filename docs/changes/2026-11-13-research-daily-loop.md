# 课题日报与本地午间任务

开发：2026-11-13；最终验收：2026-11-14。用户已批准 A/B/C；本阶段不包含目录导入、全文解析或 RAG 开发。

## 已实现

- `data/research-profile.json`：公开课题、主线/相邻方向、5 篇公开种子、来源与候选边界。默认候选 40、批次 5、筛选摘要 4000 字符、相邻方向最多 2 篇。
- arXiv/OpenAlex 按主题查询；期刊由本地日报硬门槛改为弱加分。修复 arXiv 日期串残留 `T`；无 key 的 OpenAlex 只读取首页并披露翻页限制。
- `DailyRun` 保存稳定运行身份、冻结候选和检查点；`DailyReport` 保存不可变快照；报告条目与投递标记通过短事务原子发布。模型请求在事务外执行。
- 独立 PostgreSQL 会话持有 advisory lock；进程退出释放锁。恢复只接管带 daily 命名空间的模型任务，不接管交互式解读。
- AI 缓存包含实际标题/摘要、画像、Prompt 和模型/供应商版本。报告记录模型、Prompt、输入哈希和逐字匹配的公开摘录。
- 临时错误最多退避重试一次：限流 60 秒，其余网络/超时/上游 5xx 15 秒；证据不匹配不自动放宽。云端新解读只允许摘要依据，并要求引用摘录。
- Today 读取固定日报，不用历史候选重新排序充当日报；阅读状态独立叠加，报告日期、覆盖有限、失败和过期可见。
- Windows 脚本提供 install/status/disable/remove/preview，当前用户、固定 `+08:00` 时间、禁止并行、登录补跑和超时退出。Node 与项目路径为绝对路径，XML 不含密钥。
- 普通公开候选按保留期清理；收藏、笔记、阅读资产和近期日报引用受保护。本轮没有读取、修改或上传 `D:\资料\毕设\文献` 中的 PDF。

## 真实试跑带来的调整

初始实现等待所有入选论文解读齐全后发布。试跑发现：部分论文无摘要，部分模型响应结构/摘录不合格，会使已通过条目也无法展示。

最终行为：仅使用已完成筛选批次，失败批次的候选数写入覆盖缺口；所有筛选批次失败时保持可重试，不发布。只投递通过检查的解读；无公开摘要时只列题录，明确标注不生成解读；失败条目不投递，缺口写入报告，可在后续日期再参与筛选。全部解读失败且没有题录卡时保留旧报告。已发布名单不再补写，重复运行复用该报告。

这是自动化的保守筛选，不是人工学术验证。原句存在与语义支持分开看待；当前单模型，主备回退不称为交叉验证。

## 数据迁移和环境恢复

- 新增迁移：`packages/db/prisma/migrations/20261113093143_research_daily_reports/migration.sql`；历史迁移没有修改。
- 迁移先在独立临时 PostgreSQL 上验证。个人库升级前用 `pg_dump -Fc` 备份，并在独立库完成恢复，核对论文 12,691、用户状态 0、模型配置 1、旧迁移 9，均一致。
- 备份：`backups/2026-11-13-research-daily/before-research-daily.dump`，14,858,025 字节，位于 Git 忽略目录。主密钥仍保存在原本的仓库外位置。
- 开发中断后 Docker 环境发生重建，原容器不存在、个人库为 0 张业务表。严格检查空库后，以单事务从该备份恢复，再应用新迁移；没有覆盖已有业务表。
- 备份恢复点之后、尚未另行备份的运行检查点不在恢复范围。本次重新试跑，不伪称能从已删除的数据卷继续恢复。

- 最新完整备份：`backups/2026-11-13-research-daily/after-research-daily.dump`，773,480 字节。再次在独立库恢复，核对论文 96、报告 1、报告条目 3、模型配置 1、迁移 10。旧普通公开候选按保留期清理；原始备份仍保留。

## 验证

- 最终单元/数据库回归：79 个文件、594 项测试全部通过，使用独立 PostgreSQL；详细结果为 `logs/final-vitest.log`。
- 桌面/手机 Playwright：最终 20 项通过，含筛选缺口、解读缺口、题录卡、读取失败恢复和视口/焦点检查。
- `pnpm typecheck`、`pnpm lint`、`pnpm build`、`git diff --check` 均通过。最终生产构建使用临时本机端口验证，真实 Today API 和首页均为 200，三类覆盖提示均可见。
- 全量复跑曾出现一次 Vitest fork 子进程异常退出；慢启动专项 20 项通过，随后完整 594 项通过，未稳定复现该异常，未将其宣称为已定位的业务缺陷。
- 专项覆盖：内容/画像缓存失效、无 DOI 预印本、缺失/截断摘要、输入 ID、摘录来源、来源部分失败、模型限流、进程中断恢复、固定报告复用、并发锁、发布中途失败回滚、用户资产保留和排程截止。

## 本机最终状态

- `2026-11-13` 排程日报：采集 97 条公开来源记录，冻结 40 篇候选；25 篇所在筛选批次完成，15 篇所在批次失败；6 篇入围解读。
- 实际发布 3 篇：2 篇通过解读结构与摘录检查、1 篇缺少摘要仅列题录。另 3 篇解读未通过，不投递。不为目标 5–8 篇填充不合格条目。
- 来源覆盖：arXiv 完成 47 条；OpenAlex 匿名首页 50 条，翻页需 key，已明确披露有限覆盖。
- 当前使用已有 Kimi 连接，单模型。自动检查不能认证科学结论或真实推荐准确率。
- 已启用任务 `PRI-Daily-EF620F7989`，当前用户、隐藏窗口、北京时间 12:15；核对下一次为 `2026-11-14 12:15`。
- Windows 任务实际手动触发成功，状态 Ready，退出码 0。触发前后报告指纹相同，API 审计尝试数保持 18，确认重复执行没有新增模型请求。
- 任务日志：`logs/daily/2026-11-13T15-57-50-607Z-28068.log`。这证明一次任务执行与复用，不代表已完成多日稳定性观察。
- 根据本机 Docker 冷启动超过一分钟的实测，将等待上限改为 180 秒；模拟用例覆盖慢启动成功和有界超时。


## 主要文件

| 路径 | 用途 |
|---|---|
| `data/research-profile.json`、`packages/domain/src/research-profile*.ts` | 公开画像、验证、版本与本地匹配 |
| `packages/domain/src/daily-report.ts` | 报告快照及页面状态契约 |
| `apps/worker/src/research-daily.ts`、`configured-research-daily.ts` | 可恢复执行与生产连接 |
| `apps/worker/src/jobs/{screen-papers,interpret-paper,ai-job,model-retry,ingest-source}.ts` | 有界模型请求、缓存、来源与证据检查 |
| `packages/db/src/{daily-repository,daily-today,source-sync-repository,ai-repository,paper-repository}.ts` | 原子发布、快照读取、水位与资产保护 |
| `packages/db/prisma/schema.prisma` 和新增迁移 | 日报、运行台账及摘录存储 |
| `apps/web/src/{server/today,presentation/today}.ts`、首页及卡片组件 | 固定日报与明确的覆盖/题录提示 |
| `scripts/daily-task.ps1`、`scheduled-daily.mjs`、`local.mjs` | Windows 安装管理、日志、截止和启动 |
| `tests/{domain,sources,worker,db,web,e2e}/` 相关用例 | 自动回归 |

使用入口见 [中文说明](../quick-start.zh-CN.md)。下一阶段只读目录/Zotero 接入和 RAG 仍需另行确认。

## 接口依据

- [arXiv API 手册](https://info.arxiv.org/help/api/user-manual.html)。
- [OpenAlex 搜索](https://help.openalex.org/api/searching/) 与 [免费 API key](https://openalex.org/settings/api)；本机实际匿名翻页响应为 401，明确要求 key。
- [Windows StartBoundary 时区](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-itrigger-get_startboundary)、[任务 Schema](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-schema) 和 [Register-ScheduledTask](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask)。
