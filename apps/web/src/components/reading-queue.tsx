import type { TodayRecommendationDto } from "@/presentation/today";

export function ReadingQueue({ papers }: { papers: TodayRecommendationDto[] }) {
  return (
    <section className="queue-panel" aria-labelledby="reading-queue-title">
      <div className="section-heading-row">
        <div>
          <p className="section-kicker">Next to read</p>
          <h2 id="reading-queue-title">阅读队列</h2>
        </div>
        <span className="count-badge">{papers.length}</span>
      </div>
      {papers.length === 0 ? (
        <p className="empty-copy">还没有稍后读或正在阅读的论文。</p>
      ) : (
        <ol className="queue-list">
          {papers.map((paper) => (
            <li key={paper.id}>
              <div>
                <span className="queue-state">
                  {paper.readingStatus === "READING" ? "正在阅读" : "稍后读"}
                </span>
                <p>{paper.title}</p>
              </div>
              {paper.doi ? (
                <a href={`/papers/${encodeURIComponent(paper.doi)}`}>打开</a>
              ) : paper.originalUrl ? (
                <a href={paper.originalUrl} rel="noreferrer" target="_blank">
                  原文
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
