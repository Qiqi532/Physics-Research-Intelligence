import Link from "next/link";
import { InterestSettingsPageView } from "@/components/interest-settings-page-view";
import { loadInterestPageState } from "@/server/interests";

export const dynamic = "force-dynamic";

export default async function InterestSettingsPage() {
  const state = await loadInterestPageState();
  return (
    <>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="site-header">
        <Link className="brand" href="/">PRI <span>Physics Research Intelligence</span></Link>
        <Link className="header-link" href="/">返回 Today Physics</Link>
      </header>
      <main className="settings-shell" id="main-content">
        <section className="settings-hero">
          <p className="eyebrow">Personal signals</p>
          <h1>兴趣设置</h1>
          <p>0 表示不作为兴趣信号，1 是默认等权，2 表示优先关注。交叉方向始终可见。</p>
        </section>
        <InterestSettingsPageView state={state} />
      </main>
    </>
  );
}
