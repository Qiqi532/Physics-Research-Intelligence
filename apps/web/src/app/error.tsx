"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="centered-status">
      <p className="eyebrow">Today Physics</p>
      <h1>页面暂时无法显示</h1>
      <p>发生了未预期的本地错误。你的阅读状态和论文数据没有被修改。</p>
      <button className="button-link" onClick={reset} type="button">
        重新加载
      </button>
    </main>
  );
}
