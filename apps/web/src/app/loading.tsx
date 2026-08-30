export default function Loading() {
  return (
    <main className="today-shell" aria-busy="true" aria-label="正在加载 Today Physics">
      <div className="loading-block loading-hero" />
      <div className="loading-grid">
        <div className="loading-block" />
        <div className="loading-block" />
        <div className="loading-block" />
      </div>
      <p className="loading-copy">正在整理今日物理论文…</p>
    </main>
  );
}
