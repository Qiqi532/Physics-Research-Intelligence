# Physics Research Intelligence — 手动每日运行全逻辑文档

> 版本：v1.0 | 日期：2026-09-02 | 基于首次手动运行（2026-09-01）整理
> 用途：为后续开发每日全自动流程提供参考蓝图；在可靠性门槛通过前保持 `DAILY_PIPELINE_ENABLED=false`

---

## 一、整体架构

### 1.1 三阶段筛选流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        每日处理流程（Stage 9A）                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  阶段 0：数据采集（Ingest）                                           │
│  ├── OpenAlex / arXiv / Crossref 连接器                               │
│  ├── 按时间窗口拉取论文元数据（标题、摘要、期刊、DOI、发布时间）       │
│  └── 去重后写入 Paper 表                                              │
│                                                                       │
│  阶段 1：确定性期刊质量筛选（Journal Whitelist）                       │
│  ├── 输入：阶段 0 采集的全部论文                                       │
│  ├── 规则：匹配 ~75 种 Tier1/Tier2 高质量物理学期刊白名单             │
│  ├── 匹配逻辑：长名称优先，短缩写（≤4字符）词边界匹配                  │
│  ├── 输出：仅保留白名单期刊的论文（通常 20–40 篇）                    │
│  └── 成本：零 LLM 调用，纯本地确定性过滤                               │
│                                                                       │
│  阶段 2：Kimi 轻量筛选推荐（LLM Screening）                           │
│  ├── 输入：阶段 1 筛选后的论文（标题 + 关键词，不含全文）              │
│  ├── 模型：Kimi K2.6（分类路由复用）                                  │
│  ├── 批量：每批 ≤15 篇，通常 1–3 批                                  │
│  ├── Prompt：要求模型按 0–1 分评分，标注方向，给出选中理由             │
│  ├── 用户兴趣：可选，匹配方向最多 +0.08 分（不降低质量标准）          │
│  ├── 输出：选中 10–15 篇跨方向论文，写入 PaperScreening 表           │
│  └── 成本：每批 1 次 LLM 调用（轻量，仅标题+关键词）                  │
│                                                                       │
│  阶段 3：Kimi 中文结构化解读（LLM Interpretation）                    │
│  ├── 输入：阶段 2 选中的论文（仅公开元数据和摘要，不上传 PDF）         │
│  ├── 模型：Kimi K2.6（解读路由）                                      │
│  ├── 输出：中文结构化解读（概述/问题/创新/方法/局限/建议，            │
│  │        每条带证据等级和原文引用）                                    │
│  ├── 写入：PaperInterpretation 表（状态 COMPLETE/FAILED）             │
│  ├── 容错：单篇失败不阻断其他论文，失败记录真实稳定错误码              │
│  └── 成本：每篇 1 次 LLM 调用（中等，摘要+结构化输出）                 │
│                                                                       │
│  阶段 4：后置处理                                                      │
│  ├── 分类补全：为选中论文补充 PaperClassification                      │
│  ├── 30 天清理：删除超过 PAPER_RETENTION_DAYS 的旧论文                │
│  └── 状态同步：收藏、阅读状态保持正常                                   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 关键设计原则

| 原则 | 说明 |
|------|------|
| **质量优先** | 阶段 1 用期刊白名单保证基础质量，阶段 2 用 LLM 保证相关性 |
| **成本可控** | 仅阶段 2/3 调用 LLM，阶段 1 纯本地过滤；解读仅基于摘要 |
| **容错性强** | 单篇失败不阻断，所有失败记录真实稳定错误码 |
| **可追溯** | 每次 LLM 调用记录 AiRun，含 provider/model/usage/attempts |
| **无成本估算** | Token 仅在供应商 API 明确返回时记录，不估算、不预算拦截 |

---

## 二、手动运行执行步骤

### 2.1 启动前审计（只读）

以下命令均从仓库根目录执行：

```powershell
# 1. 检查仓库状态
git status
git log --oneline -5

# 2. 检查容器状态
docker ps --filter "name=infra-"

# 3. 检查健康端点
curl http://127.0.0.1:5432  # PostgreSQL（预期连接拒绝或空响应）
curl http://127.0.0.1:6379  # Redis（预期空响应）

# 4. 检查数据库迁移状态
docker exec -i infra-postgres-1 psql -U pri -d pri -c "
  SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;
"

# 5. 检查运行配置（不打印秘密值）
Get-Content .env | Select-String -Pattern "DAILY_PIPELINE|PAPER_RETENTION|DAILY_PAPER_TARGET"
```

### 2.2 环境准备

```powershell
# 从 .env 加载配置（不打印秘密值）
Get-Content .env | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}

# 主密钥文件（必须显式注入）
$env:AI_SETTINGS_MASTER_KEY_FILE = "<仓库外的主密钥文件绝对路径>"
```

### 2.3 执行手动运行

```powershell
# 运行手动每日流程脚本
$env:DOTENV_CONFIG_PATH = ".env"
corepack pnpm exec tsx apps/worker/src/manual-daily-run.ts
```

### 2.4 运行后验证

```bash
# 1. 数据库计数验证
docker exec -i infra-postgres-1 psql -U pri -d pri -c "
  SELECT
    (SELECT COUNT(*) FROM \"Paper\") AS papers,
    (SELECT COUNT(*) FROM \"PaperScreening\") AS screenings,
    (SELECT COUNT(*) FROM \"PaperScreening\" WHERE selected = true) AS selected,
    (SELECT COUNT(*) FROM \"PaperClassification\") AS classifications,
    (SELECT COUNT(*) FROM \"PaperInterpretation\") AS interpretations,
    (SELECT COUNT(*) FROM \"PaperInterpretation\" WHERE status = 'COMPLETE') AS complete_interps,
    (SELECT COUNT(*) FROM \"AiRun\") AS ai_runs,
    (SELECT COUNT(*) FROM \"AiRun\" WHERE type = 'SCREEN') AS screen_runs,
    (SELECT COUNT(*) FROM \"AiRun\" WHERE type = 'INTERPRET') AS interpret_runs;
"

# 2. 失败论文检查
docker exec -i infra-postgres-1 psql -U pri -d pri -c "
  SELECT p.title, p.journal, ar.error_code, ar.completed_at
  FROM \"AiRun\" ar
  JOIN \"Paper\" p ON p.id = ar.paper_id
  WHERE ar.status = 'FAILED'
  ORDER BY ar.completed_at DESC;
"

# 3. Web 页面验证
# - Today 首页：有解读论文排在前面，统计显示昨日数据
# - 论文详情页：完整显示中文结构化解读
# - 未解读论文：显示"AI 解读"按钮
```

---

## 三、首次手动运行结果（2026-09-01）

### 3.1 运行概览

| 指标 | 值 |
|------|-----|
| 总耗时 | 449.6 秒（约 7.5 分钟） |
| 采集论文数 | 2,335 篇 |
| 期刊筛选后 | 24 篇 |
| Kimi 筛选选中 | 10 篇 |
| 筛选批次数 | 2 批 |
| 解读成功 | 8 篇 |
| 解读失败 | 2 篇（错误码：invalid_json） |
| 推荐列表 | 50 篇 |
| 30 天清理删除 | 0 篇 |
| Kimi 调用总数 | 约 12 次（2 筛选 + 10 解读） |

### 3.2 选中论文期刊分布

| 期刊 | 方向 | 解读状态 |
|------|------|----------|
| The Astrophysical Journal Letters | 天体物理 | 成功 |
| The Astrophysical Journal Letters | 天体物理 | 成功 |
| Advanced Optical Materials | 光学 | 失败（invalid_json） |
| eLight | 光学 | 成功 |
| Physical Review C | 核物理 | 成功 |
| Laser & Photonics Review | 光学 | 成功 |
| Monthly Notices of the RAS | 天体物理 | 失败（invalid_json） |
| Physical Review D | 高能物理 | 成功 |
| Advanced Optical Materials | 光学 | 成功 |
| eLight | 光学 | 成功 |

### 3.3 数据库最终状态

| 表 | 记录数 | 说明 |
|----|--------|------|
| Paper | 8,938 | 含历史累计 |
| PaperScreening | 24 | selected=10 |
| PaperClassification | 22 | 含历史 |
| PaperInterpretation | 11 | 全部 COMPLETE（含历史 3 篇） |
| AiRun | 18 | SCREEN=2（全部 COMPLETE），INTERPRET=13（含 2 FAILED） |

---

## 四、关键模块与文件

### 4.1 核心代码文件

| 文件 | 职责 |
|------|------|
| `packages/domain/src/journal-whitelist.ts` | ~75 种 Tier1/Tier2 高质量物理学期刊白名单 |
| `packages/ai/src/prompts/screen.ts` | Kimi 批量筛选 Prompt（含用户兴趣可选参数） |
| `packages/ai/src/provider.ts` | AiProvider 接口（screenBatch 方法） |
| `packages/ai/src/router.ts` | LLM 路由（routeScreenBatch、routeInterpretation） |
| `packages/db/prisma/schema.prisma` | PaperScreening 表、AiRunType.SCREEN |
| `apps/worker/src/jobs/screen-papers.ts` | 阶段 2 筛选 Job |
| `apps/worker/src/jobs/interpret-paper.ts` | 阶段 3 解读 Job |
| `apps/worker/src/configured-daily-processor.ts` | 每日流程编排（三阶段接入） |
| `apps/worker/src/daily-pipeline.ts` | 每日流程定义（ingest→screen→interpret） |
| `apps/worker/src/manual-daily-run.ts` | 手动运行入口脚本 |
| `apps/web/src/server/single-interpretation.ts` | Web 端单篇解读服务 |
| `apps/web/src/app/api/papers/[doi]/interpret/route.ts` | 单篇解读 API 端点 |
| `apps/web/src/components/recommendation-card.tsx` | 推荐卡片（含 AI 解读按钮） |
| `packages/db/src/today-repository.ts` | Today 数据仓库（排序、统计） |

### 4.2 配置参数

| 参数 | 当前值 | 说明 |
|------|--------|------|
| `DAILY_PIPELINE_ENABLED` | false | 每日定时任务开关（需验收后批准开启） |
| `DAILY_PIPELINE_TIME` | 06:00 | 每日执行时间（Asia/Shanghai） |
| `DAILY_PIPELINE_TIMEZONE` | Asia/Shanghai | 时区 |
| `PAPER_RETENTION_DAYS` | 30 | 论文保留天数 |
| `DAILY_PAPER_TARGET_MIN` | 10 | 每日目标论文数下限 |
| `DAILY_PAPER_TARGET_MAX` | 15 | 每日目标论文数上限 |
| `candidateLimit` | 500 | Today 候选池大小（Web/Worker 端） |
| Kimi 连接 | 已配置于本地数据库 | 不在文档中记录连接 ID |
| Kimi baseUrl | https://api.moonshot.cn/v1 | API 端点 |
| Kimi timeout | 120,000 ms | 请求超时 |

---

## 五、已知问题与后续开发方向

### 5.1 已修复问题（本次）

| # | 问题 | 修复方案 | 状态 |
|---|------|----------|------|
| 1 | 论文列表排序未优先展示有解读论文 | today-repository.ts 排序改为 hasInterpretation 优先，然后 score 降序 | ✅ 已修复 |
| 2 | 未解读论文缺少单篇 AI 解读入口 | 新建 single-interpretation.ts + API 端点 + 推荐卡片"AI 解读"按钮 | ✅ 已修复 |
| 3 | 今日统计基于当日数据不合理（应看昨日） | 统计窗口改为昨日（上海时区），基于 createdAt（入库时间） | ✅ 已修复 |
| 4 | 第二轮筛选未接入用户兴趣 | buildScreenPrompt 增加 userInterests 参数，screen 阶段前读取用户兴趣 | ✅ 已修复 |
| 5 | Today 候选池过小（50），有解读论文被淹没 | candidateLimit 提升至 500（Web/Worker 端） | ✅ 已修复 |

### 5.2 待解决问题

| # | 问题 | 影响 | 建议方案 |
|---|------|------|----------|
| 1 | 2 篇解读失败（invalid_json） | 部分论文无解读 | 增加 JSON 解析重试机制，或优化 Prompt 输出格式 |
| 2 | 跨方向信号统计为 0 | 跨方向展示缺失 | 检查分类标签的 isCrossDisciplinary 标记逻辑 |
| 3 | 页面样式在 standalone 模式下可能异常 | 视觉体验 | 检查静态资源路径配置 |
| 4 | 单篇解读按钮点击后需手动刷新 | 用户体验 | 优化为实时更新解读状态 |

### 5.3 后续开发方向

#### 方向 1：每日全自动流程

```
目标：将手动运行转化为定时自动执行
步骤：
  1. 保留现有 BullMQ 时区调度，并补齐上海日期边界测试
  2. 增加跨进程运行锁、租约心跳和僵尸运行接管
  3. 增加运行状态追踪（PENDING/RUNNING/SUCCEEDED/PARTIAL/FAILED）
  4. 增加阶段恢复、人工重跑和脱敏失败告警
  5. 连续 3 天影子运行及恢复演练通过后，再申请启用 DAILY_PIPELINE_ENABLED
```

#### 方向 2：解读质量提升

```
目标：降低 invalid_json 失败率，提升解读质量
步骤：
  1. 优化解读 Prompt，增加 JSON 格式约束
  2. 实现 JSON 解析失败后的自动重试（最多 2 次）
  3. 增加解读质量评估（完整性、准确性、可读性）
  4. 支持解读版本管理和重新解读
```

#### 方向 3：用户兴趣深度集成

```
目标：让用户兴趣更精准地影响筛选和推荐
步骤：
  1. 完善兴趣设置页面（方向权重、关键词、期刊偏好）
  2. 筛选阶段增加兴趣匹配度权重（当前最多 +0.08）
  3. 推荐排序增加兴趣匹配因子
  4. 支持兴趣学习（基于用户阅读/收藏行为自动调整）
```

#### 方向 4：运营监控与分析

```
目标：建立每日运行的可观测性
步骤：
  1. 增加运行仪表盘（每日处理量、成功率、耗时趋势）
  2. 增加 LLM 调用统计（按模型、任务类型、成功率）
  3. 增加论文库增长趋势分析
  4. 增加脱敏的运行历史与失败趋势，不采集额外用户行为遥测
```

---

## 六、全自动流程检查清单

在将 `DAILY_PIPELINE_ENABLED` 改为 `true` 之前，需完成以下检查：

- [ ] 手动运行连续 3 天成功（解读成功率 ≥ 80%）
- [ ] 2 篇 invalid_json 失败问题已修复或有重试机制
- [ ] 跨方向信号统计正常工作
- [ ] 单篇解读功能端到端验证通过
- [ ] 运行锁机制实现，防止重复执行
- [ ] 失败告警机制实现
- [ ] 运行状态追踪实现（PENDING/RUNNING/SUCCEEDED/PARTIAL/FAILED）
- [ ] 30 天清理规则验证通过
- [ ] 收藏、阅读状态不受自动运行影响
- [ ] 数据库备份策略确认
- [ ] 用户验收通过并明确批准启用

---

## 七、附录

### 7.1 期刊白名单分级标准

| 等级 | 标准 | 示例 |
|------|------|------|
| Tier 1 | 顶刊，影响因子 ≥ 10 或领域公认顶级 | Nature、Science、Physical Review Letters、Nature Physics |
| Tier 2 | 高质量期刊，影响因子 3–10 或领域核心 | Physical Review A-E、Optics Express、ApJL、MNRAS |

### 7.2 错误码定义

| 错误码 | 说明 | 可重试 |
|--------|------|--------|
| `invalid_json` | LLM 输出 JSON 解析失败 | 是（优化 Prompt 后） |
| `timeout` | 请求超时 | 是 |
| `rate_limit` | 供应商限流 | 是（退避后） |
| `authentication` | API Key 无效 | 否 |
| `business_validation` | 业务校验失败（如论文不存在） | 否 |
| `configuration` | 配置错误 | 否 |

### 7.3 相关文档

- `docs/2026-09-01-first-manual-run-report.md` — 首次手动运行完整报告
- `docs/2026-09-01-run-data-snapshot.json` — 运行数据结构化快照
- 仓库外发布前数据库备份及其校验值（不得提交备份文件）
- `docs/daily-automation-development-and-deployment.md` — 自动化开发、验收、部署与回滚规范

---

*本文档基于 2026-09-01 首次手动运行整理，后续全自动流程开发应以此为参考蓝图，并根据实际运行情况持续更新。*
