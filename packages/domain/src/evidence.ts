export type EvidencePage = { number: number; text: string; status: "text" | "columns" | "empty" | "failed" };
export type EvidenceDocument = { title: string | null; pages: EvidencePage[] };
export type EvidenceHit = {
  id: string; title: string; role: string; page: number; pageCount: number;
  quote: string; status: string; parserVersion: string;
};

const aliases: [RegExp, string[]][] = [
  [/光电流|光生电流/, ["photocurrent", "photogenerated current"]],
  [/符号翻转|极性(?:反转)?|正负光响应|双极性|正负切换|变号/, ["sign reversal", "polarity", "bipolar", "negative photocurrent", "positive photocurrent"]],
  [/栅压|栅极|栅控|栅电压/, ["gate", "gating", "gate voltage"]],
  [/波长|光谱/, ["wavelength", "spectral", "spectrum"]],
  [/响应度|响应率/, ["responsivity", "photoresponsivity"]],
  [/响应时间|上升时间|下降时间/, ["response time", "rise time", "fall time", "decay time"]],
  [/探测率|探测度/, ["detectivity"]],
  [/光电探测|光探测器/, ["photodetector", "photodetection"]],
  [/光晶体管|光电晶体管/, ["phototransistor", "photo transistor"]],
  [/光功率|光强|功率密度/, ["power density", "intensity", "optical power"]],
  [/存储|记忆/, ["memory", "retention", "storage"]],
  [/运动|移动物体/, ["motion", "moving"]],
  [/感内计算|传感器内计算/, ["in sensor computing", "in sensor processing"]],
  [/类视网膜|仿视网膜/, ["retinomorphic", "retina", "retinal"]],
  [/视觉|识别/, ["vision", "visual", "recognition"]],
  [/神经形态|神经拟态/, ["neuromorphic"]],
  [/突触/, ["synaptic", "synapse"]],
  [/迟滞|滞回/, ["hysteresis"]],
  [/异质结|异质结构/, ["heterojunction", "heterostructure"]],
  [/二维|二維/, ["two dimensional", "2d"]],
  [/互补场效应|互补晶体管/, ["cfet", "complementary field effect"]],
  [/垂直堆叠|垂直集成/, ["vertical", "stacked", "monolithic"]],
  [/漏电流|漏极电流/, ["drain current", "leakage current"]],
  [/阈值电压/, ["threshold voltage"]],
  [/迁移率/, ["mobility"]],
  [/二硫化钼/, ["mos2", "molybdenum disulfide"]],
  [/石墨烯/, ["graphene"]],
  [/黑磷/, ["black phosphorus"]],
  [/暗电流/, ["dark current"]],
  [/噪声/, ["noise"]],
  [/薄膜/, ["thin film"]],
  [/厚度/, ["thickness"]],
  [/温度|室温/, ["temperature"]],
];

function hanWords(text: string): string[] {
  return text.length < 2 ? [text] : Array.from({ length: text.length - 1 }, (_, i) => text.slice(i, i + 2));
}

export function normalizeEvidence(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\u00ad/g, "")
    .replace(/([a-z])[-‐]\s*\n\s*([a-z])/g, "$1$2")
    .replace(/\p{Script=Han}+/gu, (word) => ` ${hanWords(word).join(" ")} `)
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

const stopWords = new Set("a an and are as at be by can do does for from how in is it of on or page paper the to what which with".split(" "));

const exactAliases: [RegExp, string[]][] = [
  [/栅极电压|栅极偏压|栅电压|栅压|栅极/, ["gate voltage", "gate bias", "vgs", "vg", "v gs", "v g", "vbg", "v bg"]],
  [/漏极电压|漏源电压|漏源偏压|漏极偏压|漏压/, ["drain voltage", "drain bias", "drain source voltage", "vds", "vd", "v ds", "v d"]],
  [/波长/, ["wavelength", "wavelengths", "laser at", "illumination at", "λ"]],
  [/光功率密度|功率密度|辐照度/, ["power density", "irradiance"]],
  [/入射光功率|入射功率|光功率/, ["incident optical power", "incident power", "optical power"]],
  [/上升时间/, ["rise time", "rising time"]],
  [/下降时间|衰减时间/, ["fall time", "decay time", "falling time"]],
  [/响应时间/, ["response time", "response times", "photoresponse time"]],
  [/响应度|响应率/, ["responsivity", "photoresponsivity", "photo responsivity"]],
  [/室温/, ["room temperature", "ambient temperature"]],
];

export function evidenceQuery(query: string, exact = false): string[][] {
  const input = query.trim().normalize("NFKC").toLowerCase();
  if (!input || input.length > 300) return [];
  const groups: string[][] = [];
  let remaining = input;
  for (const [pattern, english] of exact ? exactAliases.concat(aliases) : aliases) {
    const typed = exact ? [...remaining.matchAll(new RegExp(pattern.source, "g"))].map((match) => match[0])
      : [input.match(pattern)?.[0]].filter((word): word is string => Boolean(word));
    if (typed.length) {
      groups.push([...english, ...new Set(typed.map(normalizeEvidence))]);
      if (exact) remaining = remaining.replace(new RegExp(pattern.source, "g"), " ");
    }
  }
  for (const token of input.match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? []) {
    if (!stopWords.has(token) && !groups.some((group) => group.includes(token))) groups.push([normalizeEvidence(token)]);
  }
  if (exact) {
    for (const word of remaining.match(/\p{Script=Han}+/gu) ?? []) groups.push([normalizeEvidence(word)]);
    if (groups.length > 12) return [];
  } else if (!groups.length) {
    const stripped = input.replace(/哪些|哪一页|哪篇|论文|讨论|提到|什么|请问|如何|有没有|关于|查找|介绍|的|了/g, "");
    for (const word of stripped.match(/\p{Script=Han}+/gu) ?? []) groups.push([normalizeEvidence(word)]);
  }
  return groups.filter((group) => group.some(Boolean)).slice(0, 12);
}

export function evidenceQuote(text: string, groups: string[][]): string {
  const blocks = text.split(/\n\s*\n/u);
  let best = text.slice(0, 330), bestScore = -1;
  for (const block of blocks) {
    for (let offset = 0; offset < block.length; offset += 165) {
      const excerpt = block.slice(offset, offset + 330).trim();
      const searchable = ` ${normalizeEvidence(excerpt)} `;
      const score = groups.filter((terms) => terms.some((term) => searchable.includes(` ${term}`))).length;
      if (score > bestScore) { best = excerpt; bestScore = score; }
      if (offset + 330 >= block.length) break;
    }
  }
  return best;
}

export function fileRole(name: string): string {
  if (/(?:supplement|supporting|(?:^|[\s_.-])si(?:$|[\s_.-])|补充)/iu.test(name)) return "补充材料";
  if (/(?:draft|稿件|草稿)/iu.test(name)) return "稿件";
  if (/(?:报告|report)/iu.test(name)) return "报告";
  return "主文";
}
