# 任务计划：物理科研情报平台 MVP

## 目标
为个人物理学习与研究建立一个可持续的 Today Physics 网站：合规聚合论文元数据、提供可核验的 AI 解读，并按个人兴趣推荐阅读内容。

## 当前阶段
阶段 4：实现可解释推荐、内部 API 与 Today Physics 页面

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
- [ ] 增加正式 Playwright E2E 与至少 30 篇人工内容质量评审
- **状态：** in_progress（阶段 4 交付门禁已通过；长期试运行评审留待下一阶段）

### 阶段 5：交付
- [ ] 部署个人可用版本
- [ ] 配置密钥、定时任务、备份与使用说明
- **状态：** pending

## 已做决策
| 决策 | 理由 |
|---|---|
| 单用户 MVP | 快速验证研究价值，数据模型预留 `user_id` |
| 全物理覆盖、偏好排序 | 防止首页被预设学科偏见锁定，保留交叉发现 |
| 聚合数据库优先 | 可持续、低维护，降低出版社页面改版风险 |
| 订阅全文不入库 | 不绕过访问控制，不将付费全文发送给模型 |
| 多云 API 适配层 | 可在 DeepSeek、OpenAI、Gemini、Qwen 间比较和切换 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|---|---:|---|
| Codex 桌面补丁入口在新 worktree 后刷新 Windows workspace 失败 | 3 | 根因定位到 workspace 刷新辅助进程；改用同一 Codex 可执行文件的内建 apply_patch 模式，已验证可创建、更新和删除文件 |
| 阶段 3 计划补丁正文被命令编排层解析 | 1 | 移除非必要行内代码标记并缩小补丁上下文后成功应用 |
| Git Bash 后台预览服务被回收 | 2 | 改为直接启动 Node 预览服务，HTTP 200 验证 |
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
