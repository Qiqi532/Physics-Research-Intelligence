# Bug 修复：跨方向信号（crossSignals）始终为空

> 状态：**实现完成并通过单元回归，正在随本轮变更做全量验证（未推送 GitHub）**。
> 日期：2026-09-03

## 1. 现象

`GET /api/today` 返回的 `crossSignals` 始终为空数组 `[]`，即使库中存在带 `cross-disciplinary`（交叉物理）标签、且 `isCrossDisciplinary=true` 的论文（如 3 篇 Science 期刊语料论文）。

该问题最早记录于 2026-09-02 代码审查报告的 P1 遗留项；用户在设置兴趣后复测仍为空，确认不是"未设兴趣"导致。

## 2. 根因

`packages/db/src/today-repository.ts` 中：

```ts
crossSignals: collectCrossSignals(yesterdayPapers),
```

`collectCrossSignals` 遍历传入论文的标签，仅统计 `isCrossDisciplinary === true` 的标签。但传入的是 `yesterdayPapers`——即 **`createdAt` 落在"上海时区昨日 00:00–24:00"** 的论文（见 `stats` 那段过滤）。

时间口径错位：

- **候选池**：`getToday` 按 `publishedAt` 在"近 30 天"取论文（最多 `candidateLimit=500`）。
- **crossSignals**：却只看"昨日新入库"的论文。

结果：跨方向论文只要不是在"运行当日的前一天"`createdAt`，就永远进不了 `crossSignals`。那 3 篇 Science 论文发布已久、`createdAt` 远早于昨日，因此信号恒为空。

根因本质：**crossSignals 的窗口与候选池/展示集的窗口不一致**——它统计的是"新入库日"，而非"当天实际展示的推荐"。

## 3. 修复

将 `collectCrossSignals` 的输入从 `yesterdayPapers` 改为 **`recommendations`**（即实际排序后展示给用户的论文集合）：

```ts
crossSignals: collectCrossSignals(recommendations),
```

并在调用处加注释说明原因（见 `today-repository.ts`）。

- `recommendations` 已经过 `rankRecommendations` 排序、包含每篇论文的 `tags`（含 `isCrossDisciplinary`）。
- 这样只要某篇交叉方向论文出现在 Today 视图中，它就会被统计进 `crossSignals`，与"展示什么就发现什么"的语义一致。
- `stats`（newPapers / openPapers / interpretedPapers / crossDisciplinaryPapers）仍基于 `yesterdayPapers`，保持原统计口径，未改动。

## 4. 修复后的预期

- 当 Today 候选池（近 30 天 `publishedAt`）中存在带 `cross-disciplinary` 标签的论文时，`crossSignals` 将非空。
- 若当前窗口内确实没有任何交叉方向论文，`crossSignals` 为空是**正确结果**，不再是 bug。

> 注意：截至本修复验证时，库内 3 篇带 `cross-disciplinary` 标签的 Science 论文 `publishedAt` 均早于 30 天窗口，因此即使修复后 `/api/today` 仍返回空——这是数据使然，非逻辑问题。一旦管线按月抓取并摄入新的交叉方向论文，信号即会正常出现。

## 5. 回归测试

`tests/db/today-repository-unit.test.ts` 新增用例 `surfaces cross-disciplinary papers in Today regardless of ingestion day`：

- 构造一篇 `cross-disciplinary` 标签论文，但其 `createdAt` 设为远早于"昨日"（2026-08-01）。
- 断言 `crossSignals` 包含 `{ tagSlug: "cross-disciplinary", labelZh: "交叉物理", paperCount: 1 }`。
- 该用例在**旧实现**下会因 `yesterdayPapers` 过滤而得到 `[]`，**新实现**下通过——精确锁定本次 bug。

## 6. 审查要点

- `collectCrossSignals` 函数本身未改（仍按 `isCrossDisciplinary` 统计），仅修正了输入集合，降低回归风险。
- 未改变 `cross-disciplinary` 标签本身的定义（种子 `isCrossDisciplinary=true` 正确）。
- 若未来希望 crossSignals 覆盖"多方向论文"（如 amo-optics + condensed-matter 但无显式 cross 标签），需在 `collectCrossSignals` 中增加"标注多方向"的判定，属独立增强，不在本次修复范围。

## 7. 验证状态

- [x] 单元回归测试通过。
- [x] `packages/db` 类型检查通过。
- [x] `/api/today` 运行时冒烟测试无报错（返回结构正常）。
- [ ] 真实端到端验证（需在 30 天窗口内存在交叉方向论文，待管线按月运行后观察）。
- [ ] 未提交 GitHub（按用户要求）。
