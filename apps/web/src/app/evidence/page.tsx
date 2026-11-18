import Link from "next/link";
import { headers } from "next/headers";
import { EvidenceSearch } from "@/components/evidence-search";
import { allowEvidence, withEvidence } from "@/server/evidence";
import { zoteroOnline } from "@pri/domain/zotero-local";

export const dynamic = "force-dynamic";
export const metadata = { title: "本地证据检索 · PRI", referrer: "no-referrer" as const };
const labels: Record<string, string> = { ready: "已索引", missing: "源文件已移除", unavailable: "暂时不可读", changed: "扫描时文件变化",
  invalid_pdf: "PDF 无法解析", locked: "需要解密", too_large: "文件超过上限", too_many_pages: "页数超过上限",
  empty: "无可检索文字", failed: "提取失败", columns: "双栏待核对" };

export default async function EvidencePage() {
  const allowed = allowEvidence(await headers());
  const data = allowed ? await withEvidence((repo) => repo.inventory()).catch(() => null) : null;
  const online = data?.zotero.length ? await zoteroOnline() : null;
  return <><a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="site-header"><Link className="brand" href="/">PRI <span>Physics Research Intelligence</span></Link>
      <nav className="site-nav" aria-label="主要导航"><Link className="header-link" href="/">Today Physics</Link>
        <Link className="header-link" href="/library">我的收藏</Link></nav></header>
    <main className="today-shell evidence-shell" id="main-content"><h1>本地证据检索</h1>
      {!allowed ? <p>请在本机模式下通过 localhost 或 127.0.0.1 打开。</p> : !data ? <p role="alert">索引库暂时不可用，请检查 PostgreSQL 并应用数据库迁移。</p> : <>
        <p>{data.indexed} 份独立 PDF 已索引。检索结果可打开原件的对应物理页。</p>
        <nav className="evidence-tools" aria-label="证据工作台">
          <Link className="text-link" href="/evidence/comparison" prefetch={false}>器件证据对照表</Link>
          <Link className="text-link" href="/evidence/ask" prefetch={false}>本地证据问答</Link>
        </nav>
        <EvidenceSearch />
        <details className="evidence-panel" open={!data.files.length}><summary>文献目录与解析状态</summary>
          <p>在项目根目录运行 <code>pnpm evidence:index --root &quot;文献目录&quot;</code> 添加或刷新目录。</p>
          {!!data.issues.length && <p>{data.issues.map((issue) => `${labels[issue.status] ?? issue.status} ${issue._count} 页`).join("，")}</p>}
          <ul>{data.files.map((file, index) => <li key={index}>{file.name} · {file.role} · {labels[file.status] ?? file.status}
            {file.document && ` · ${file.document.pageCount} 页`}
            {file.documentId && file.status === "ready" && <> · <Link prefetch={false} href={`/evidence/${file.documentId}/1`}>打开原文</Link></>}</li>)}</ul>
        </details>
        <details className="evidence-panel" open={!!data.zotero.length}><summary>Zotero 只读收藏夹</summary>
          <p>用 <code>pnpm evidence:zotero --list</code> 查看收藏夹键，用 <code>pnpm evidence:zotero --collection KEY</code> 同步选定收藏夹。</p>
          {online === false && <p role="status">Zotero 本地接口离线，显示上次成功同步的索引。</p>}
          {data.zotero.map((collection) => <section key={collection.id}>
            <h2>{collection.title}</h2>
            <p>{collection.collectionKey} · {collection._count.attachments} 份 PDF 附件 · 最近成功同步 {collection.syncedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
            {collection.lastError && <p>上次同步未完成，已保留最近成功的索引。</p>}
            <ul>{collection.attachments.map((file) => <li key={file.attachmentKey}>
              {file.title} · {file.role} · {labels[file.status] ?? file.status}
              {file.document && ` · ${file.document.pageCount} 页`}
              {file.documentId && file.status === "ready" && <> · <Link prefetch={false} href={`/evidence/${file.documentId}/1`}>打开原文</Link></>}
            </li>)}</ul>
          </section>)}
        </details></>}
    </main></>;
}
