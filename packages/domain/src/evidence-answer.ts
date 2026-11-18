import { evidenceQuery, normalizeEvidence } from "./evidence";

export type EvidenceAnswerScope = "single" | "cross";
export type EvidenceAnswerCandidate = {
  id: string; title: string; page: number; paperId: string | null; role: string; status: string; text: string;
};
type Reference = Pick<EvidenceAnswerCandidate, "id" | "title" | "page" | "status"> & { quote: string };
export type EvidenceAnswer = { status: "answered" | "insufficient"; references: Reference[] };

const quantities = /(?<![A-Za-z\d.])((?:[+\-−]\s*)?\d+(?:\.\d+)?(?:[eE][+\-−]?\d+|\s*[×x]\s*10\s*\^?[+\-−⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹\d]+)?)\s*(nm|[μµu]m|[mμµu]?V|[fpnumkMμµ]?A\s*(?:[/∕]\s*W|W\s*[−⁻–-]\s*[1¹])|[fpnumkMμµ]?W(?:\s*(?:[/∕]\s*(?:cm|m)\s*[2²]|(?:cm|m)\s*[−⁻–-]\s*[2²]))?|[fpnumkMμµ]?A|[fpnumμµ]?s|[kMG]?Hz|°C|K|%)(?![A-Za-zμµ\d/])/gu;
const minusVariants = /[−–⁻]/g;

function measuredQuantities(text: string) {
  return [...text.matchAll(quantities)].map(({ 0: raw, 1: value, 2: unit, index }) => ({
    raw,
    index,
    value: value.normalize("NFKC").replace(minusVariants, "-").replace(/^\+/, "").replace(/\s+/g, "").replace("×", "x"),
    unit: unit.normalize("NFKC").replace(minusVariants, "-").replace("∕", "/").replace(/\s+/g, "")
      .replace(/^(.*A)W-1$/, "$1/W").replace(/^(.*W)(cm|m)-2$/, (_, watts, area) => watts + "/" + area + "2").replaceAll("u", "μ"),
  }));
}

const kMinus = /[−–⁻]/g;

const metricUnits: [RegExp, RegExp][] = [
  [/响应度|响应率|\b(?:photo\s*)?responsivity\b/i, /A\/W$/],
  [/响应时间|上升时间|下降时间|衰减时间|\b(?:response|rise|fall|decay|rising|falling) times?\b/i, /^(?:[fpnmμ]?s)$/],
  [/波长|\b(?:wavelengths?|(?:laser|illumination)\s+at)\b|λ/iu, /^(?:nm|μm)$/],
  [/栅(?:极)?(?:电压|偏压)|栅压|\b(?:gate\s+(?:voltage|bias)|V[ _]*(?:GS|BG|G))\b/i, /V$/],
  [/漏压|漏[极源](?:电压|偏压)|\b(?:drain(?:\s+source)?\s+(?:voltage|bias)|V[ _]*(?:DS|D))\b/i, /V$/],
  [/功率密度|辐照度|\b(?:power density|irradiance)\b/i, /W\/(?:cm|m)2$/],
  [/光功率(?!密度)|入射功率(?!密度)|\b(?:optical|incident) power(?! density)\b/i, /W$/],
  [/光电流|光生电流|暗电流|\b(?:photocurrent|dark current)\b/i, /A$/],
  [/温度|\btemperature\b/i, /^(?:K|°C)$/],
];

const chineseFiller = /(?:这(?:两|几|一)?篇(?:论文|文献|文章)?|本(?:篇|文)|各(?:篇)?论文|跨篇|不同论文|论文|文献|文章|原文|证据|有无|有没有|分别|在何处|哪[一几]页|第几页|哪些?|提到|给出|列出|找出|找到|查找|请问|显示|测得|报道|报告|测量|条件|工况|是多少|多少|多大|多长|是什么|什么|是否|为多少|下的|下时|下|中的|中|出现|在哪|同时|讨论|和|与|及|的|了|是|在)/gu;
const englishFiller = /\b(?:reported|reports?|measured|observed|found|given|articles?|studies|study|papers?|documents?|show|shows|mention(?:ed|s)?|where|find|locate|quoted?|source|says?|was|were|did|please|much|respectively|under|each|across|also|same|value(?:s)?)\b/gi;
const unsupportedIntent = /为什么|为何|怎么|如何|原因|推断|预测|外推|最佳|最好|最高|最低|优于|谁更|哪篇更|相差|是否证明|\b(?:why|predict|infer|extrapolate|best|highest|lowest|outperform|rank|ratio|difference)\b/i;
const numericIntent = /多少|多大|多长|数值|多快|\b(?:how (?:much|many|long|fast)|value of|what (?:is|was|are|were))\b/i;

export function prepareEvidenceQuestion(query: string) {
  if (unsupportedIntent.test(query)) return null;
  const fixed = measuredQuantities(query);
  const remaining = query.replace(quantities, " ").replace(chineseFiller, " ").replace(englishFiller, " ");
  const terms = evidenceQuery(remaining, true);
  const asksForValue = numericIntent.test(query);
  const metrics = asksForValue ? metricUnits.filter(([label]) => label.test(query)) : [];
  if (!terms.length || (asksForValue && !metrics.length)) return null;
  return { terms, fixed, metrics, search: terms.concat(fixed.map(({ raw }) => [normalizeEvidence(raw)])) };
}

function* passages(text: string, status: string) {
  const body = text.split(/(?:^|\n)[ \t]*(?:references|works cited|参考文献)[ \t]*(?:\n|$)/i, 1)[0];
  const sentences = body.split(/\n[ \t]*\n|(?<=[!?;。！？；])(?:\s+|(?=\p{Script=Han}))|(?<=\.)\s+(?=[A-Z“"])|,\s+(?=while\b|whereas\b)/u);
  for (const sentence of sentences) {
    const text = sentence.trim();
    if (status !== "columns") {
      if (text.length >= 15 && text.length <= 900) yield text;
      continue;
    }
    const lines = text.split("\n");
    // Long runs of reconstructed columns can include interleaved captions or nearby labels.
    for (let size = 1; size <= Math.min(3, lines.length); size++) {
      for (let start = 0; start + size <= lines.length; start++) {
        const excerpt = lines.slice(start, start + size).join("\n").trim();
        if (excerpt.length >= 15 && excerpt.length <= 900) yield excerpt;
      }
    }
  }
}

function reportsQuantity(quote: string, values: ReturnType<typeof measuredQuantities>, metric: [RegExp, RegExp]) {
  const [label, unit] = metric;
  const mentions = [...quote.matchAll(new RegExp(label.source, label.flags + "g"))];
  return values.some((amount) => unit.test(amount.unit) && mentions.some((match) => {
    const end = match.index + match[0].length;
    if (amount.index < match.index) {
      return /^[\s\-–−]*$/.test(quote.slice(amount.index + amount.raw.length, match.index));
    }
    const between = quote.slice(end, amount.index);
    return between.length <= 72 && /^(?:[\s,:≈=~<>≤≥]|[\(（][\p{L}\p{N}_\s]{1,14}[\)）]|\b(?:was|were|is|are|of|about|approximately|around|typically|reach(?:es|ed)?|achieve[sd]?|remain(?:s|ed)?|be|up|down|to|as|high|low|less|more|than|above|below|measured|found|estimated|set|held|fixed|maintained|at)\b|为|约|达到|高于|低于)*$/iu.test(between);
  }));
}

export function answerFromEvidence(
  question: NonNullable<ReturnType<typeof prepareEvidenceQuestion>>,
  pages: EvidenceAnswerCandidate[],
  scope: EvidenceAnswerScope,
): EvidenceAnswer {
  const references: Reference[] = [];
  const papers = new Set<string>();
  const titles = new Set<string>();
  const quotes = new Set<string>();
  for (const page of pages) {
    const title = normalizeEvidence(page.title);
    const paper = page.paperId ?? page.id;
    if (scope === "cross" && (papers.has(paper) || (title && titles.has(title)) || page.role !== "主文")) continue;
    for (const quote of passages(page.text, page.status)) {
      const normalized = normalizeEvidence(quote);
      const searchable = " " + normalized + " ";
      if (quotes.has(normalized) ||
        !question.terms.every((group) => group.some((term) => searchable.includes(" " + term + " ")))) continue;
      const values = measuredQuantities(quote);
      if (!question.fixed.every((condition) => values.some(({ value, unit }) => condition.value === value && condition.unit === unit)) ||
        !question.metrics.every((metric) => reportsQuantity(quote, values, metric))) continue;
      references.push({ id: page.id, page: page.page, title: page.title, status: page.status, quote });
      quotes.add(normalized);
      papers.add(paper);
      titles.add(title);
      break;
    }
    if (references.length === 3) break;
  }
  return references.length >= (scope === "cross" ? 2 : 1)
    ? { status: "answered", references } : { status: "insufficient", references: [] };
}
