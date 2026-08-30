# Physics Research Intelligence quality evaluation rubric

This rubric prepares a real human review; it does not contain synthetic scores or conclusions. Reviewers must read the public abstract and disclosed source facts used by the product. Full text may be consulted only when lawfully accessible, and any extra evidence must be identified separately from what the product saw.

## Scoring

Use 1–5 for each dimension. `N/A` is allowed only with a written reason.

1. **Classification correctness** — 1 is materially wrong; 3 captures the main field with notable omissions; 5 assigns the primary and cross-disciplinary tags precisely.
2. **Chinese overview faithfulness** — 1 invents or contradicts claims; 3 is broadly faithful but loses important qualifiers; 5 preserves scope, quantities, conditions, and uncertainty without embellishment.
3. **Innovation-point evidence** — 1 presents unsupported novelty; 3 links novelty to the abstract but overstates strength; 5 ties every innovation claim to traceable public evidence at the correct evidence level.
4. **Limitations and uncertainty** — 1 suppresses or fabricates limitations; 3 gives generic caveats; 5 clearly separates stated limitations, abstract-based inference, and unknowns.
5. **Recommendation-reason truthfulness and usefulness** — 1 gives a false/personalized rationale; 3 is true but generic; 5 accurately reflects recorded interests or cold-start logic and helps decide whether to read.
6. **Cross-field discovery value** — 1 is a spurious cross-field label; 3 has a plausible but weak bridge; 5 reveals a meaningful, non-obvious connection without sacrificing relevance.

## Review protocol

1. Freeze the application commit, prompt versions, provider/model identifiers, and evaluation date.
2. Select 30 real papers from the public-source trial pool using the quotas below. Do not select papers merely because the output looks good.
3. Record DOI/arXiv/source URL and the facts visible to the model. Never paste API keys, restricted full text, or personal data.
4. Have one primary reviewer score every row. A second reviewer independently scores at least 10 rows spanning all dimensions.
5. Resolve disagreements of two or more points with written evidence. Keep both original scores.
6. Report per-dimension median, range, failure count (score 1–2), and examples of recurring failure modes. Do not average away a factual hallucination.

## Sampling quotas

The 30-paper set must cover all existing PhysicsTag directions: 4 AMO/optics, 4 condensed matter/materials, 3 high-energy/particle, 3 nuclear, 4 astrophysics, 3 statistical/computational, 3 plasma, 3 biophysics, and 3 explicitly cross-disciplinary papers. Include at least five papers with no AI interpretation at first ingest and at least five that exercise a meaningful cross-field signal.

## Thirty-paper review template

Leave scores blank until a human has reviewed the real paper and application output.

| # | Required direction | Paper identifier / source URL | Class. 1–5 | Chinese fidelity 1–5 | Innovation evidence 1–5 | Limits 1–5 | Recommendation 1–5 | Cross-field 1–5 | Evidence, defects, reviewer |
|---:|---|---|---:|---:|---:|---:|---:|---:|---|
| 01 | 原子、分子与光学 | 待选择 |  |  |  |  |  |  |  |
| 02 | 原子、分子与光学 | 待选择 |  |  |  |  |  |  |  |
| 03 | 原子、分子与光学 | 待选择 |  |  |  |  |  |  |  |
| 04 | 原子、分子与光学 | 待选择 |  |  |  |  |  |  |  |
| 05 | 凝聚态与材料 | 待选择 |  |  |  |  |  |  |  |
| 06 | 凝聚态与材料 | 待选择 |  |  |  |  |  |  |  |
| 07 | 凝聚态与材料 | 待选择 |  |  |  |  |  |  |  |
| 08 | 凝聚态与材料 | 待选择 |  |  |  |  |  |  |  |
| 09 | 高能与粒子物理 | 待选择 |  |  |  |  |  |  |  |
| 10 | 高能与粒子物理 | 待选择 |  |  |  |  |  |  |  |
| 11 | 高能与粒子物理 | 待选择 |  |  |  |  |  |  |  |
| 12 | 核物理 | 待选择 |  |  |  |  |  |  |  |
| 13 | 核物理 | 待选择 |  |  |  |  |  |  |  |
| 14 | 核物理 | 待选择 |  |  |  |  |  |  |  |
| 15 | 天体物理 | 待选择 |  |  |  |  |  |  |  |
| 16 | 天体物理 | 待选择 |  |  |  |  |  |  |  |
| 17 | 天体物理 | 待选择 |  |  |  |  |  |  |  |
| 18 | 天体物理 | 待选择 |  |  |  |  |  |  |  |
| 19 | 统计与计算物理 | 待选择 |  |  |  |  |  |  |  |
| 20 | 统计与计算物理 | 待选择 |  |  |  |  |  |  |  |
| 21 | 统计与计算物理 | 待选择 |  |  |  |  |  |  |  |
| 22 | 等离子体物理 | 待选择 |  |  |  |  |  |  |  |
| 23 | 等离子体物理 | 待选择 |  |  |  |  |  |  |  |
| 24 | 等离子体物理 | 待选择 |  |  |  |  |  |  |  |
| 25 | 生物物理 | 待选择 |  |  |  |  |  |  |  |
| 26 | 生物物理 | 待选择 |  |  |  |  |  |  |  |
| 27 | 生物物理 | 待选择 |  |  |  |  |  |  |  |
| 28 | 交叉物理 | 待选择 |  |  |  |  |  |  |  |
| 29 | 交叉物理 | 待选择 |  |  |  |  |  |  |  |
| 30 | 交叉物理 | 待选择 |  |  |  |  |  |  |  |

## Required human deliverables

- Complete all 30 identifiers, scores, and evidence notes with real reviews.
- Record the second-reviewer subset and disagreements.
- Decide release thresholds before seeing aggregate results.
- File concrete follow-up issues for every factual hallucination, unsupported innovation claim, hidden uncertainty, or false recommendation reason.
