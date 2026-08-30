import type { presentPaperDetail } from "@/presentation/paper";

type ReadyPaperView = Extract<ReturnType<typeof presentPaperDetail>, { kind: "ready" }>;

const EVIDENCE_META = {
  direct: { title: "原文直接信息", className: "evidence-direct" },
  inferred: { title: "归纳推断", className: "evidence-inferred" },
  uncertain: { title: "不确定", className: "evidence-uncertain" },
} as const;

export function PaperInterpretation({ view }: { view: ReadyPaperView }) {
  const interpretation =
    view.data.interpretation?.status === "complete" ? view.data.interpretation : null;

  if (view.interpretationState === "missing") {
    return (
      <section className="status-panel" aria-labelledby="interpretation-title">
        <p className="section-kicker">AI interpretation</p>
        <h2 id="interpretation-title">尚无 AI 解读</h2>
        <p>公开事实和原文入口仍可使用；后台完成解读后会在这里显示。</p>
      </section>
    );
  }
  if (view.interpretationState === "unavailable" || !interpretation) {
    return (
      <section className="status-panel status-warning" aria-labelledby="interpretation-title">
        <p className="section-kicker">AI interpretation</p>
        <h2 id="interpretation-title">AI 解读暂时不可用</h2>
        <p>已保留公开论文事实，异常解读内容不会展示。</p>
      </section>
    );
  }

  return (
    <section className="interpretation" aria-labelledby="interpretation-title">
      <div className="section-heading-row interpretation-heading">
        <div>
          <p className="section-kicker">Structured interpretation</p>
          <h2 id="interpretation-title">论文解读</h2>
        </div>
        <span className="disclosure-badge">{interpretation.sourceDisclosure}</span>
      </div>

      <div className="bilingual-overview">
        <article>
          <p className="field-label">中文概述</p>
          <p>{view.overviewZh}</p>
        </article>
        <article lang="en">
          <p className="field-label">English abstract</p>
          <p>{view.overviewEn ?? "No public English abstract is available."}</p>
        </article>
      </div>

      <div className="interpretation-fields">
        <article>
          <p className="field-label">研究问题</p>
          <p>{interpretation.researchQuestion.text}</p>
        </article>
        <article>
          <p className="field-label">创新</p>
          <ClaimList claims={interpretation.innovations.map(({ text }) => text)} />
        </article>
        <article>
          <p className="field-label">方法与证据</p>
          <ClaimList claims={interpretation.methodsAndEvidence.map(({ text }) => text)} />
        </article>
        <article>
          <p className="field-label">局限</p>
          <ClaimList claims={interpretation.limitations.map(({ text }) => text)} />
        </article>
      </div>

      <div className="evidence-boundaries" aria-label="证据等级与置信度">
        {(Object.keys(EVIDENCE_META) as Array<keyof typeof EVIDENCE_META>).map(
          (level) => {
            const claims = view.evidenceGroups[level];
            const meta = EVIDENCE_META[level];
            return (
              <section className={`evidence-panel ${meta.className}`} key={level}>
                <h3>{`证据等级：${meta.title}`}</h3>
                {claims.length === 0 ? (
                  <p className="empty-copy">本组暂无内容。</p>
                ) : (
                  <ul>
                    {claims.map((claim, index) => (
                      <li key={`${claim.fieldLabel}-${index}`}>
                        <div className="evidence-meta">
                          <span>{claim.fieldLabel}</span>
                          <span>{`置信度：${claim.confidenceLabel}`}</span>
                        </div>
                        <p>{claim.text}</p>
                        <EvidenceReferences references={claim.evidenceReferences} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          },
        )}
      </div>

      <aside className="reading-advice">
        <p className="field-label">阅读建议</p>
        <ClaimList claims={interpretation.readingAdvice} />
      </aside>
      <p className="model-disclosure">
        解读来源：{interpretation.provider} / {interpretation.model} · 提示词版本 {interpretation.promptVersion}
      </p>
    </section>
  );
}

function ClaimList({ claims }: { claims: string[] }) {
  return (
    <ul className="claim-list">
      {claims.map((claim) => (
        <li key={claim}>{claim}</li>
      ))}
    </ul>
  );
}

function EvidenceReferences({
  references,
}: {
  references: ReadyPaperView["evidenceGroups"]["direct"][number]["evidenceReferences"];
}) {
  return (
    <ul className="reference-list" aria-label="证据引用">
      {references.map((reference, index) => (
        <li key={`${reference.source}-${reference.locator}-${index}`}>
          {sourceLabel(reference.source)} · {reference.locator}
          {reference.quote ? <q>{reference.quote}</q> : null}
        </li>
      ))}
    </ul>
  );
}

function sourceLabel(source: "metadata" | "abstract" | "open_content"): string {
  if (source === "metadata") {
    return "公开元数据";
  }
  if (source === "abstract") {
    return "公开摘要";
  }
  return "开放内容";
}
