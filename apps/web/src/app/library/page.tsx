import Link from "next/link";
import { LibraryPaperList } from "@/components/library-paper-list";
import { StatusPanel } from "@/components/status-panel";
import { loadLibraryPageState } from "@/server/papers";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const state = await loadLibraryPageState();

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="site-header">
        <Link className="brand" href="/">
          PRI <span>My Library</span>
        </Link>
        <nav className="site-nav" aria-label="主要导航">
          <Link className="header-link" href="/">
            Today Physics
          </Link>
          <Link className="header-link" href="/settings/interests">
            兴趣设置
          </Link>
          <Link className="header-link" href="/settings/models">
            模型管理台
          </Link>
        </nav>
      </header>
      <main className="today-shell" id="main-content">
        <section className="hero">
          <div>
            <p className="eyebrow">Physics Research Intelligence</p>
            <h1>我的收藏</h1>
          </div>
          <div className="hero-note">
            <p>收藏的论文会一直保留，不会进入 30 天清理。</p>
          </div>
        </section>

        {state.kind === "error" ? (
          <StatusPanel
            actionHref="/"
            actionLabel="返回 Today Physics"
            title="收藏列表暂时不可用"
            message="公开事实暂时无法读取，请稍后重试。"
          />
        ) : (
          <LibraryPaperList papers={state.data} />
        )}
      </main>
    </>
  );
}
