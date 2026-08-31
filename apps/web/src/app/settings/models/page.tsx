import Link from "next/link";
import { ModelSettingsPageView } from "@/components/model-settings-page-view";
import { loadModelSettingsPageState } from "@/server/model-settings";

export const dynamic = "force-dynamic";

export default async function ModelSettingsPage() {
  const state = await loadModelSettingsPageState();
  return <><a className="skip-link" href="#main-content">跳到主要内容</a><header className="site-header"><Link className="brand" href="/">PRI <span>Physics Research Intelligence</span></Link><nav className="site-nav" aria-label="设置导航"><Link className="header-link" href="/settings/interests">兴趣设置</Link><Link className="header-link" href="/">返回 Today Physics</Link></nav></header><main className="settings-shell model-settings-shell" id="main-content"><section className="settings-hero"><p className="eyebrow">Local AI control</p><h1>模型管理台</h1><p>保存多个命名连接，分别选择分类与解读模型。官方接口会自动填入推荐地址和模型名。</p></section><ModelSettingsPageView state={state} /></main></>;
}
