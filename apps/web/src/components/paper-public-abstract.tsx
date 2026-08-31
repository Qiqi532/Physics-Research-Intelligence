export function PaperPublicAbstract({ abstract }: { abstract: string | null }) {
  return (
    <section className="public-abstract" aria-labelledby="public-abstract-title">
      <div className="section-heading-row">
        <div>
          <p className="section-kicker">Public abstract</p>
          <h2 id="public-abstract-title">公开摘要</h2>
        </div>
      </div>
      {abstract ? (
        <p className="public-abstract-copy">{abstract}</p>
      ) : (
        <p className="empty-copy">该公开来源未提供摘要。</p>
      )}
    </section>
  );
}
