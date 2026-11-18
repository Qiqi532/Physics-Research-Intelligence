# 本地每日文献工具使用说明

更新：2026-11-14。默认不依赖 Redis；Docker 只需要 PostgreSQL。

## 启动和生成日报

在项目目录双击 `Start-PRI.cmd`，或在 PowerShell 运行：

```powershell
.\Start-PRI.cmd check       # 只读检查环境
.\Start-PRI.cmd             # 打开本地网页
.\Start-PRI.cmd daily       # 采集公开题录、调用模型、生成日报
```

网页为 http://127.0.0.1:3000 。保留启动窗口，按 Ctrl+C 停止本次网页进程。数据库和日报不会删除。有生产构建时启动脚本优先使用；修改代码后先执行 `pnpm build`。

首次初始化依赖与数据库：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:deploy
pnpm build
```

便捷入口不自动安装依赖或迁移数据库；已有个人库迁移前应先备份并验证恢复。本次升级已完成个人库备份与临时库恢复核对，备份位于 `backups/2026-11-13-research-daily/before-research-daily.dump`。

## 日报现在怎样工作

- 公开画像位于 `data/research-profile.json`：主方向、相邻方向、5 篇公开种子、来源、候选上限和摘要长度均可编辑。不要把私人笔记、路径或稿件内容放入公开画像。
- 默认每次最多筛选 40 篇，每批 5 篇；筛选摘要上限 4000 字符；相邻方向最多 2 篇。期刊仅作弱参考，预印本和无 DOI 论文可以入选。
- 默认目标 5–8 篇，允许更少或空报告。来源水位有两天重叠；达到分页上限会保留游标，不冒充完整采集。
- Today 显示已经发布的固定名单、顺序、理由、逐字核对的摘录与本次摘要解读。阅读状态可更新，已发布事实不会重新排序。
- 同一日期、画像和模型/Prompt 配置的重复执行复用报告；未发布的失败任务从检查点恢复。修改画像或模型后会建立新的运行身份，近期已投递论文仍受去重约束。
- 12:15 前运行对应前一排程日，12:15 后对应当天。失败或过期会显示状态，并保留上次已发布报告。
- 已完成筛选批次的结果可继续处理，失败批次写入覆盖缺口；所有批次失败时不发布。
- 无摘要论文只展示题录，不请求模型生成解读。部分解读失败时只投递已校验条目，缺口写入日报；全部解读失败且没有题录卡时不发布。发布后的名单不再补写，未投递论文可以在后续日期再参与。
- 每个临时模型错误最多退避重试一次；限流等待 60 秒，网络/超时等等待 15 秒。证据不匹配不会靠重试放宽规则。
- 当前为单模型判断；主备回退不等于多模型交叉验证。摘录来源检查不能证明论文结论或推荐准确率。

## 模型和来源配置

打开 http://127.0.0.1:3000/settings/models ，保存实际可用的模型连接，并配置筛选（分类路由）与解读路由。当前本机已有 Kimi 连接；可在这里改为 DeepSeek。密钥在本地输入，无需发到聊天。

根目录 `.env` 用于便捷入口和任务；已保存的模型路由优先于环境路由。网页与任务必须以同一用户访问同一个模型主密钥文件。

OpenAlex 无 key 时仅取首页，并明确显示覆盖有限；需要翻页时，在根目录 `.env` 设置 `OPENALEX_API_KEY`。免费 key 从 https://openalex.org/settings/api 获取。arXiv 仍可独立参与；接口失败不会用虚构论文补齐。

所有云端请求仅使用公开题录、摘要和公开研究画像。`D:\资料\毕设\文献` 的 PDF、私人笔记和本地稿件尚未接入，不会自动读取或上传。目录索引、全文检索和 RAG 属于下一阶段。

## 每天中午自动运行

在项目根目录使用 Windows PowerShell：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\daily-task.ps1 install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\daily-task.ps1 status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\daily-task.ps1 disable
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\daily-task.ps1 remove
```

只预览定义可将动作改为 `preview`。脚本使用绝对 Node/项目路径，支持中文与空格；任务名按项目和用户生成，不使用 SYSTEM，不把密钥写进命令行或任务 XML。

默认北京时间 12:15，任务 XML 固定 `+08:00`，不跟随 Windows 时区变化。时间来自根目录 `.env` 的 `DAILY_PIPELINE_TIME`；本地任务当前要求 `DAILY_PIPELINE_TIMEZONE=Asia/Shanghai`。修改时间后重新执行 install。

本机任务已安装并启用，实际触发验收退出码为 0；下一次排程为 2026-11-14 12:15。Docker 冷启动最多等待 3 分钟。

任务只在当前用户已登录时运行；错过排程后，登录或唤醒可补跑。电脑关闭期间不能生成日报。安装在当天排程之后时，首次日历触发设为次日，避免安装时立即调用模型。

任务禁止并行，数据库锁同时覆盖手动与自动运行。默认运行截止 60 分钟（`DAILY_RUN_MAX_MINUTES`，允许 5–180）；超时终止自己的子进程树，下一次执行恢复未完成进度。任务计划程序另设 5 分钟退出余量。

日志位于 `logs/daily/`。来源覆盖有限但已发布报告的任务可正常结束；没有发布报告的失败返回非零状态。午间启动不保证供应商优惠价格，也不保证全部请求都在同一价格时段结束。

## 排查和关闭

- Docker 未就绪：打开 Docker Desktop，待引擎运行后重试；不要删除数据卷。
- 无日报：确认模型路由和主密钥可用，运行 `Start-PRI.cmd daily`，查看稳定错误码和 Today 状态。
- 来源覆盖有限：检查提示；OpenAlex 翻页需 key，分页上限会在下一次采集继续。
- 模型限流/校验失败：失败进度已保存，可稍后重跑或在模型管理台切换可用路由。
- 网页仍显示旧界面：关闭原启动窗口，执行 `pnpm build` 后重开；启动脚本会复用已有实例。

仅关闭网页用 Ctrl+C；长期不用时，可另外执行：

```powershell
docker compose -f infra/docker-compose.yml stop postgres
```

禁用或移除定时任务不会删除数据库、报告、密钥和文献。
