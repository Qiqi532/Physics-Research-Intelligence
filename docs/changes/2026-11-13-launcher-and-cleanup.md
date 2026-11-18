# 便捷入口、使用说明与项目清理

日期：2026-11-13。本轮已完成使用脚本与清理；下一阶段业务开发仅形成计划，等待用户确认。

## 新增入口

- `Start-PRI.cmd`：Windows 双击入口，支持空格/中文项目路径；失败时保留窗口便于看提示。
- `scripts/local.mjs`：只用 Node 内置模块与已安装的工作区依赖，不新增第三方包。
- `start`：检查依赖/配置，必要时尝试启动 Docker Desktop，只启动 PostgreSQL，启动本机 Web，等待网页存活后打开浏览器。已有实例只复用，不接管其他进程。
- `check`：只读检查，不启动应用、容器或模型。
- `daily`：只有用户显式调用时才执行真实推荐；显示来源访问、模型调用和数据库写入提示，沿用原有非收藏记录清理。
- 便捷入口从根目录 `.env` 加载到子进程环境，保留继承变量优先级；本地模式、关闭自动队列和遥测由入口明确设置。实际环境文件不被改写。
- 不自动安装依赖、执行迁移、创建 Windows 自动任务或上传本地 PDF。
- 优先启动现有生产构建，缺少构建时回退开发预览；生产模式固定本机 3000 端口。更新代码后先重新构建。

使用步骤见 `docs/quick-start.zh-CN.md`。

## 本机验证

- `node --check scripts/local.mjs` 通过。
- `node scripts/local.mjs --help` 正常展示帮助，不启动服务。
- 新增启动行为回归覆盖只读检查、重复启动、Docker 未启动/超时、数据库失败、显式推荐入口、取消轮询、参数解析及生产/开发启动分支。
- 实际 `node scripts/local.mjs check` 正确报告 Docker 引擎未运行，返回码 1。
- 实际 `start --no-browser` 能找到已安装 Docker Desktop 并发起启动，但引擎未在等待时间内就绪，随后退出；没有进入数据库/Web 启动阶段，没有执行真实推荐。
- 用户确认 Docker Desktop 卡住，计划稍后重启，明确要求先完成其他工作，因此停止 Docker 排查。当前未证明整条本机启动链路通过。
- 窗口工具未获 Docker Desktop 访问权限，未能读取具体报错；没有修改 Windows/WSL/权限设置。

收尾验证：新增入口测试共 19 个用例；完整 `pnpm test` 为 67 个文件通过、6 个跳过，515 个用例通过、34 个数据库用例跳过。`cmd /d /c Start-PRI.cmd --help` 正常返回 0；脚本语法和 `git diff --check` 通过。已核对缓存/旧报告目录不存在、归档存在且被 Git 忽略、原有生产构建和 worker 构建仍保留。

## 清理结果

清理前逐一核对绝对路径位于工作区内，并排除根目录、祖先和子项中的目录链接。没有跨 shell 拼接删除命令。

| 处理 | 路径 | 文件数 | 字节 |
|---|---|---:|---:|
| 删除可再生缓存 | `apps/web/.next/cache` | 109 | 176375666 |
| 删除旧测试报告 | `playwright-report` | 1 | 516519 |
| 删除旧测试状态 | `test-results` | 1 | 45 |
| 合计 | | 111 | 176892230 |

约释放 **168.7 MiB**。缓存后续运行可能重新生成；这不是移除运行依赖或缩减业务架构。

两个已忽略、未被 Git 跟踪的历史一次性脚本移动到：

```text
backups/project-cleanup-2026-11-13/.tmp-edit-config.mjs
backups/project-cleanup-2026-11-13/fetch-test.mjs
```

归档用于清理项目根目录、保留恢复能力，不计入释放容量。`backups/` 继续由现有 `.gitignore` 排除，不展示归档脚本内容。

保留：源码和未提交修改、锁文件、依赖、Prisma 生成客户端、Web standalone 与 worker 构建产物、数据库卷、真实 `.env`/密钥、原始论文目录、评审材料、历史计划与工作树。未因为文档较旧或文件未跟踪而删除它们。

## 本轮文件清单

- 新增 `Start-PRI.cmd`
- 新增 `scripts/local.mjs`
- 新增 `tests/worker/local-launcher.test.ts`
- 新增 `docs/quick-start.zh-CN.md`
- 新增 `docs/superpowers/plans/2026-11-13-next-daily-loop.md`
- 新增 `docs/changes/2026-11-13-launcher-and-cleanup.md`（本文件）
- 更新 `README.md` 的日常入口说明

当前业务框架、采集/模型逻辑和数据库 schema/迁移未作进一步修改。

## 待确认的下一步

建议依次完成课题画像与定向采集、固定日报与恢复、12:15 Windows 自动任务，粗估 3–5 个有效开发日。具体范围、改动位置、验收命令与用户所需工作已写入独立计划；本轮不提前实现，也不把本地全文发送云端。
