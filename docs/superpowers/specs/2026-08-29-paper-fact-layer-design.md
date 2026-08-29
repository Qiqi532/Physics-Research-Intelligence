# 论文事实层与数据浏览 API 设计

## 1. 范围与验收结果

阶段 1 建立论文事实层：接收规范化之前的公开论文元数据，将同一 DOI 合并为一篇 `Paper`，保留每个来源的独立 `PaperSource`，并通过只读内部 API 浏览论文。无 DOI 记录永不自动合并，只返回可解释的候选重复。

阶段结束时应能：

- 将两个不同来源、等价 DOI 的记录写成一篇论文和两条来源记录。
- 将无 DOI 的相似记录分别保存，同时返回候选重复及相似度。
- 查询论文列表和单篇论文，并看到来源链与物理标签。
- 用 Prisma 迁移在 PostgreSQL 中建立完整 MVP 核心表。

本阶段不包含真实来源采集、AI 调用、推荐排序或页面重做。

## 2. 模块边界

`packages/domain` 保存无数据库依赖的规则：输入 schema、DOI/标题/作者规范化、候选重复判断和固定物理标签表。`packages/db` 保存 Prisma schema、客户端工厂和仓储；仓储只接受领域层定义的输入。`apps/web` 提供只读 Route Handler，不直接编写 Prisma 查询。

数据流：

```text
原始来源记录 → 领域校验/规范化 → PaperRepository → PostgreSQL
                                             ↓
浏览请求 → Route Handler → PaperRepository → 安全响应字段
```

## 3. 规范化与去重规则

- DOI：去除 `doi:`、`https://doi.org/` 或 `http://dx.doi.org/` 前缀，Unicode NFKC，去除首尾空白并转小写；必须满足 `10.<4–9 位数字>/<非空后缀>`。
- 标题：Unicode NFKC、小写、标点与符号转空格、合并连续空白。
- 作者：Unicode NFKC、小写、标点转空格、合并空白。
- 有 DOI：以规范化 DOI 唯一索引为权威身份；来源记录以 `(source_name, source_record_id)` 唯一。
- 无 DOI：每次新来源记录建立独立 `Paper`。仅当标题 token Jaccard 相似度不低于 `0.85`、第一作者规范化后相同、发布日期相差不超过 7 天时，返回候选重复；不得自动改写 `paper_id`。

## 4. 数据模型

- `Paper`：稳定 UUID、可空 DOI、原始/规范化标题、摘要、期刊、发布日期、原文 URL、访问状态与时间戳。
- `PaperSource`：来源名、来源记录 ID、来源 URL、检索时间、许可证 URL及该来源的元数据快照。
- `PhysicsTag`：固定 slug、中文/英文标签、分组和交叉方向标志。
- `PaperClassification`：论文与标签的关系、相关性、理由、模型和提示词版本。
- `PaperInterpretation`：结构化 JSON、状态、provider、模型和提示词版本。
- `UserInterest`：单用户保留 `user_id`，记录标签权重。
- `UserPaperState`：阅读状态、反馈和笔记。
- `AiRun`：调用类型、幂等键、模型、token、耗时、状态、错误码与成本。

枚举只表达稳定状态；AI 的可变结构化内容保存为 PostgreSQL JSON。金额使用 Decimal，所有时间为 UTC。

## 5. Prisma 与连接管理

固定使用 Prisma `7.10.0`、`@prisma/client` `7.10.0`、`@prisma/adapter-pg` `7.10.0` 与 `pg`。使用 `prisma-client` generator 输出到 `packages/db/src/generated/prisma`，ESM 导入扩展名设为 TypeScript。数据库 URL 由调用方传入客户端工厂；模块导入时不读取环境变量、不创建连接池。

集成测试使用独立 PostgreSQL schema `pri_stage1_test`，测试前清理该 schema 内的表，不触碰应用的 `public` schema。

## 6. API 与错误边界

- `GET /api/papers?limit=20&cursor=<uuid>`：按创建时间和 UUID 倒序返回分页结果，`limit` 为 1–100。
- `GET /api/papers/<encoded-doi>`：规范化 DOI 后返回论文、来源和标签；非法 DOI 返回 400，不存在返回 404。
- API 只返回事实字段、来源追踪和分类标签，不返回数据库连接、内部堆栈、AI 成本明细或任何密钥。
- 数据库不可用时记录脱敏错误并返回通用 503。

## 7. 测试策略

- 领域单元测试覆盖 DOI、标题、作者、标签表和候选重复阈值边界。
- PostgreSQL 集成测试覆盖 DOI 合并、来源唯一性、无 DOI 不自动合并、候选重复和列表查询。
- Route Handler 测试以仓储接口注入测试替身，覆盖参数校验、404 和响应字段边界，不依赖数据库。
- 最终运行 Prisma schema 校验、迁移部署、完整测试、lint、类型检查和生产构建。

## 8. 非目标与安全边界

不抓取网络论文、不缓存受限全文、不实现模糊自动合并、不加入向量数据库、不创建多用户认证。测试与迁移命令只使用本地 Compose 数据库的开发凭据，不写入 `.env`，不记录真实密钥。
