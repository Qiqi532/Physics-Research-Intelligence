# Physics Research Intelligence

面向个人物理学习与研究的论文情报平台。系统聚合公开论文事实，使用可切换的模型完成保守分类与结构化解读，并通过确定性、可解释的兴趣评分生成 Today Physics。

## 零成本本地试运行

当前个人使用不需要购买域名或 VPS。推荐先在电脑上运行 PostgreSQL、Redis、Web 和 worker，浏览器访问 `http://127.0.0.1:3000`。真实开放论文语料的下载、校验和导入见 [本地语料说明](data/review-corpus/README.md) 与 [个人部署与运维](docs/operations.md#local-real-data-trial)。浏览公开事实不需要模型 API Key；未生成的 AI 解读会如实显示为缺失。

手机或平板属于可选能力：确认 PostgreSQL/Redis 仍只监听本机后，可显式运行 Web 的可信局域网模式。同一校园网可能启用设备隔离，因此电脑端是本阶段的保证路径。应用当前没有登录，不能把局域网端口映射到公网。

## 当前完成度

当前代码已完成阶段 1–5 的 MVP 交付：

- 公开来源采集：Crossref、OpenAlex、arXiv，包含游标、超时、有界重试、429/5xx 处理和保守去重。
- 事实层：PostgreSQL/Prisma 保存公开元数据、摘要、来源、许可证和原文链接，不保存或发送受限全文。
- AI 流水线：分类、结构化中英文解读、证据等级、置信度、来源披露、预算预留、幂等审计和一次主备回退。
- 模型接入：OpenAI、DeepSeek、Gemini、Qwen、智谱 GLM、Kimi、混元，以及通用 OpenAI Chat Completions 兼容端点。
- Today Physics：今日统计、跨方向信号、解释性推荐、阅读队列、论文详情和降级错误态。
- 兴趣与阅读状态：兴趣权重设置，以及稍后读、正在阅读、完成和不感兴趣状态。
- 自动运行：BullMQ 每日采集、分类、预算内解读和 Today 准备，支持时区、开关和同窗口幂等。
- 可靠性：存活/就绪健康检查、稳定错误码、脱敏结构化日志、队列/worker 状态和失败恢复。
- 测试：259 项 Vitest（含 PostgreSQL 集成）和 16 项 Playwright 桌面/移动 E2E。
- 运维：启动停止、迁移、备份恢复、健康检查和故障排查文档，以及 30 篇人工质量评审空白模板。

## 推荐部署方式

现阶段首选上文的 Windows 本机方案，成本为零。只有需要电脑关机后仍可访问、跨网络访问或公开分享时，才考虑一台香港或新加坡 Linux VPS：PostgreSQL 与 Redis 使用持久卷，Web 与 worker 作为两个独立的常驻进程，Next.js 前放 Nginx/Caddy 等反向代理并启用 HTTPS。2 vCPU、4 GB 内存和 40 GB 磁盘可作为以后的小规模起点，实际容量应按论文量、构建峰值和备份保留期调整。

选择香港/新加坡主要是为了减少个人首发的备案步骤并兼顾国际论文来源连通性；这是工程建议，不是网络质量保证。如果服务器位于中国大陆并公开提供非经营性网站，应先按工信部要求完成备案。Docker 官方支持在单服务器上用 Compose 运行生产应用，Next.js 官方自托管说明建议在 Node 服务前使用反向代理。

不建议只部署到纯静态托管或仅使用 Vercel Web 项目：本系统有服务端数据库访问和需要持续在线的 BullMQ worker。可以拆分托管，但 Web、worker、PostgreSQL 和 Redis 四个运行边界都必须存在。

当前是无登录的单用户应用。首次部署必须限制为本人访问，例如校园/家庭私网、VPN，或带密码/身份验证的反向代理。未增加应用认证前，不应直接暴露到公共互联网。

详细命令见 [个人部署与运维](docs/operations.md)。生产自托管参考：[Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)、[Docker Compose production](https://docs.docker.com/compose/how-tos/production/)、[工信部非经营性互联网信息服务备案管理办法](https://www.miit.gov.cn/gyhxxhb/jgsj/cyzcyfgs/bmgz/xxtxl/art/2024/art_84a0cfa0ebd049bbbe751dca9a008e56.html)。

## 你主要需要完成的事项

1. 决定只供本人访问，还是未来公开；公开前先实现应用认证，位于中国大陆则办理备案。
2. 准备一台长期在线的 Linux 主机、域名和 HTTPS；不要把校园电脑直接作为公网生产服务器。
3. 创建强 PostgreSQL 密码，设置 `DATABASE_URL`、`REDIS_URL`、每日时间/预算，并只填一个首选模型 API Key。密钥只放服务器环境，不提交 Git。
4. 按运维文档安装锁定依赖、执行 Prisma migration、启动一个 Web 和一个 worker，然后验证 live/ready、Today、兴趣、详情和阅读状态。
5. 配置每日异机备份及恢复演练，至少保留一份可验证的 PostgreSQL dump 和校验和。
6. 用真实公开来源做小流量试运行，核对来源配额、模型费用、队列积压和每天的失败记录。
7. 按 [质量评审模板](docs/evaluation-rubric.md) 人工评审至少 30 篇跨方向论文；模板为空，不得把未评审内容当成结果。

## 后续开发优先级

### P0：公开部署前

- 增加登录/会话与 CSRF 防护，移除固定 `default` 用户假设，或明确保持单用户并由外部访问控制保护。
- 增加可重复的 Web/worker 生产镜像或 systemd 服务文件、反向代理示例和自动化发布/回滚脚本。
- 在隔离试运行环境中分别验证一个真实论文来源和一个真实模型 Provider；限制请求量并保留费用与失败审计。
- 完成 30 篇人工内容质量评审，按结果校准标签、提示词和证据规则。

### P1：稳定试运行

- 增加 CI 门禁，自动运行 lint、typecheck、Vitest、Playwright、Prisma validate 和生产构建。
- 增加仅面向管理员的每日任务、预算、来源失败和队列积压视图；继续使用现有结构化日志，不接入外部遥测平台。
- 完成异机备份保留策略、定期恢复演练和发布后的首个每日任务验收。
- 根据真实数据补充搜索、筛选、来源覆盖率和推荐反馈闭环。

### P2：研究能力扩展

- 仅在许可证和来源条款明确允许时处理开放获取全文，并继续把受限全文排除在采集和模型输入之外。
- 增加人工校正、评审数据集版本和可重复模型比较；成本默认值应按供应商最新价格人工维护。
- 评估多用户、向量检索或更复杂推荐前，先验证个人试运行是否持续产生研究价值。

## 已知限制

- 尚未创建真实云资源、域名、TLS、生产数据库或正式备份任务。
- 尚未用真实模型 Key、真实生产来源流量或校园订阅全文执行自动流程。
- 30 篇跨方向人工评审尚未填写。
- 本地旧 PostgreSQL/Redis 容器仍沿用历史的全网卡端口绑定；仓库当前 Compose 已改为 loopback，重建容器后才会生效。
- Web/worker 尚无仓库内完整生产 Dockerfile 或 systemd 单元，当前按运维文档使用 Node/pnpm 与操作系统进程管理器部署。

## 文档入口

- [系统设计](docs/superpowers/specs/2026-08-27-physics-research-intelligence-design.md)
- [事实层设计](docs/superpowers/specs/2026-08-29-paper-fact-layer-design.md)
- [MVP 实施计划](docs/superpowers/plans/2026-08-27-physics-research-intelligence-mvp.md)
- [个人部署与运维](docs/operations.md)
- [人工质量评审](docs/evaluation-rubric.md)
