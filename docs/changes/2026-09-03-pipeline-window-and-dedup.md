# 设计修改：每日管线窗口改为"前一个月" + 按兴趣挑选 + 每日不重复

> 状态：**实现与审查修复已完成，正在本地验证（未推送 GitHub）**。本文档记录最终设计与剩余生产化工作。
> 关联任务：用户反馈"每天获取前一天的论文可能有些困难，期刊的发文量没有这么多"。
> 日期：2026-09-03

## 1. 背景与问题

原每日管线（`dailyWindowAt`）使用 **24 小时窗口**（前一个调度时刻 → 当前调度时刻）。对期刊类来源，单日发文量很低，许多运行日抓到的论文寥寥无几，导致：

- 候选池偏薄，按兴趣挑选后可选论文少；
- "Today" 视图在低密度日几乎无新内容。

用户判断这是设计逻辑问题，要求改为：**抓取"之前一个月"的论文 → 按兴趣挑选 → 保证每天不重复**。

## 2. 改动文件清单

| 文件 | 改动 |
|---|---|
| `packages/domain/src/config.ts` | `DailyPipelineConfig` 增加 `ingestWindowDays`、`deliveryRecencyDays`；新增 env `DAILY_INGEST_WINDOW_DAYS`、`DAILY_DELIVERY_RECENCY_DAYS` 解析 |
| `apps/worker/src/scheduler.ts` | `dailyWindowAt(now, tz, time, ingestWindowDays=1)` 窗口起点改为 `key - ingestWindowDays` 天 |
| `packages/db/prisma/schema.prisma` | `PaperScreening` 增加 `deliveredAt DateTime?` 字段 + 索引 |
| `packages/db/prisma/migrations/20260903140000_add_screening_delivered_at/migration.sql` | 新增迁移（ALTER TABLE + 索引） |
| `packages/db/src/ai-repository.ts` | `listScreenedSelectionCandidates` 增加 `excludeDeliveredWithinDays` 过滤；新增 `markScreeningsDelivered` |
| `apps/worker/src/configured-daily-processor.ts` | 传入 `ingestWindowDays`；Today 成功准备后按 `deliveryRecencyDays` 标记 `deliveredAt` |
| `.env.example` | 补充两个新变量的说明与默认值 |

## 3. 设计决策

### 3.1 窗口改为"前一个月"
- `DAILY_INGEST_WINDOW_DAYS`（默认 30，范围 1–365）。`dailyWindowAt` 的窗口起点 = `key - ingestWindowDays` 天的调度时刻，终点 = `key` 的调度时刻。
- 该窗口同时驱动 **ingest / screen / 选择 / prepareToday**（与原设计一致，仅放宽跨度）。
- `dailyWindowAt` 增加带默认值的第 4 参数，**默认 1 天，现有调用与单测行为不变**。

### 3.2 按兴趣挑选（沿用既有能力）
- `listInterpretationPaperIds` → `buildDailySelectionFromScreening` → `selectDailyPapers` 已按兴趣权重 + 每方向上限做多样性挑选，本次未改动这部分逻辑，仅把"不重复"叠加其上。

### 3.3 每日不重复（delivery dedupe）
- 新增 `PaperScreening.deliveredAt`。每日选择时，若 `DAILY_DELIVERY_RECENCY_DAYS > 0`，论文必须至少有一条已选筛选记录，且不能存在近 N 天内已投递的已选筛选记录；去重作用于整篇论文，而不是单条筛选记录。
- 选择阶段保持只读。只有 Today 成功准备后，才对选中的 paperIds 调用 `markScreeningsDelivered` 写入 `deliveredAt = 当前窗口终点`；写入失败会让本次运行失败并被调度器观察到，不再静默吞错。
- `DAILY_DELIVERY_RECENCY_DAYS` 默认等于 `DAILY_INGEST_WINDOW_DAYS`（即一个周期内每篇至多投递一次）；设为 `0` 可关闭去重。

## 4. 行为变化

- 候选池从"近 1 天"扩大为"近 N 天"，低密度日不再饿死。
- 同一篇论文在一个 `deliveryRecencyDays` 周期内不会被重复选入每日解读/推荐。
- `getToday` 的候选窗口（`CANDIDATE_WINDOW_MS = 30 天`）保持不变，仍按 `publishedAt` 取近 30 天；与 ingest 窗口（默认同为 30 天）对齐。

## 5. 已知权衡（审查要点）

- **滚动窗口的重复抓取**：窗口每天平移 1 天，ingest 的 source-sync 去重（`completedWindow` 按精确 `from/until` 匹配）不会命中，因此每日会重新抓取重叠的近 N 天范围。抓取靠 DOI `upsertFromSource` 幂等，正确性无虞，但会产生重复的网络/API 请求。对当前个人项目规模可接受。**生产建议**：改用基于游标/上次成功时间的增量抓取，或将 ingest 窗口锚定到固定日历边界（如"上一个自然月"）。
- **screen/interpret 的重复处理**：`screenPapers` 的批次幂等键含 `from|until`，窗口平移会导致每日重新跑批次筛选；`interpretPaper` 对已完成论文返回 `duplicate`，天然幂等。同样正确但偏重。**生产建议**：将筛选批次幂等键改为基于论文内容哈希（已含 `inputHash`），去掉对 `from/until` 的依赖。
- 本次**未改动** `getToday` 的 30 天候选窗口与排序；跨方向信号修复见同目录 `2026-09-03-crosssignals-fix.md`。
- 当前没有分布式锁或持久化 run ledger。自动调度默认关闭；启用时应保持单 worker，直到补齐运行级互斥、重试审计和告警。

## 6. 测试

- `tests/worker/scheduler.test.ts`：`DAILY_PIPELINE` 断言补充新字段；`dailyWindowAt` 旧用例（3 参）仍验证 24h 行为不变。
- `tests/db/ai-repository-unit.test.ts`：新增 `excludeDeliveredWithinDays` 过滤断言 + `markScreeningsDelivered` 断言。
- 类型检查：`packages/domain`、`packages/db`、`apps/worker` 均 `tsc --noEmit` 通过。
- 单元回归：`tests/db/today-repository-unit.test.ts` 的 crossSignals 修复测试独立覆盖（见 bug 修复文档）。

## 7. 验证状态

- [x] 迁移已 `prisma migrate deploy` 应用，Prisma Client 已重新生成。
- [x] 类型检查通过。
- [x] 投递配置、论文级去重与投递时序聚焦测试通过。
- [ ] 端到端真实运行（需开启 `DAILY_PIPELINE_ENABLED=true` 并配置 provider key，产生费用，待用户决定）。
- [ ] 未提交 GitHub（按用户要求，保持本地）。
