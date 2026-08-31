export default function PaperLoading() {
  return (
    <main className="paper-detail-shell" aria-busy="true" aria-label="正在加载论文详情">
      <div className="loading-block loading-paper-title" />
      <div className="loading-block loading-paper-body" />
      <p className="loading-copy">正在读取公开事实与已有解读…</p>
    </main>
  );
}
