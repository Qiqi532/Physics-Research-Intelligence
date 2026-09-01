export type EvidenceLevel = "direct" | "inferred" | "uncertain";

export type EvidenceReferenceDto = {
  source: "metadata" | "abstract" | "open_content";
  locator: string;
  quote?: string;
};

export type EvidenceClaimDto = {
  text: string;
  evidenceLevel: EvidenceLevel;
  evidenceReferences: EvidenceReferenceDto[];
};

export type CompleteInterpretationDto = {
  status: "complete";
  basis: "abstract_only" | "abstract_and_open_content";
  sourceDisclosure: "基于摘要解读" | "基于摘要和开放内容解读";
  overviewZh: EvidenceClaimDto;
  researchQuestion: EvidenceClaimDto;
  innovations: EvidenceClaimDto[];
  methodsAndEvidence: EvidenceClaimDto[];
  limitations: EvidenceClaimDto[];
  readingAdvice: string[];
  provider: string;
  model: string;
  promptVersion: string;
  createdAt: string;
};

export type PaperDetailDto = {
  id: string;
  doi: string | null;
  title: string;
  abstract: string | null;
  journal: string | null;
  firstAuthor: string | null;
  publishedAt: string | null;
  originalUrl: string | null;
  accessStatus: "UNKNOWN" | "OPEN" | "RESTRICTED";
  createdAt: string;
  updatedAt: string;
  sources: Array<{
    id: string;
    sourceName: string;
    sourceRecordId: string;
    sourceUrl: string;
    retrievedAt: string;
    licenseUrl: string | null;
  }>;
  tags: Array<{
    slug: string;
    labelEn: string;
    labelZh: string;
    relevance: number;
    reason: string;
  }>;
  interpretation: CompleteInterpretationDto | { status: "unavailable" } | null;
  userState: {
    status: "UNREAD" | "SAVED" | "READING" | "COMPLETE" | "SKIPPED";
    feedback: "NONE" | "LIKE" | "DISLIKE";
    note: string | null;
    isFavorite: boolean;
    favoritedAt: string | null;
    updatedAt: string;
  } | null;
};

export type PaperDetailLoadState =
  | { kind: "ready"; data: PaperDetailDto }
  | { kind: "not_found" }
  | { kind: "error" };

export type PresentedEvidenceClaim = EvidenceClaimDto & {
  fieldLabel: string;
  confidenceLabel: "高" | "中" | "低";
};

export function presentPaperDetail(state: PaperDetailLoadState):
  | { kind: "not_found" }
  | { kind: "error"; title: string; message: string }
  | {
      kind: "ready";
      data: PaperDetailDto;
      title: string;
      overviewEn: string | null;
      overviewZh: string | null;
      interpretationState: "complete" | "missing" | "unavailable";
      sourceDisclosure: string | null;
      accessLabel: string;
      evidenceGroups: Record<EvidenceLevel, PresentedEvidenceClaim[]>;
    } {
  if (state.kind === "not_found") {
    return { kind: "not_found" };
  }
  if (state.kind === "error") {
    return {
      kind: "error",
      title: "论文详情暂时不可用",
      message: "公开事实和解读暂时无法读取，请稍后重试。",
    };
  }
  const interpretation = state.data.interpretation;
  const complete = interpretation?.status === "complete" ? interpretation : null;
  const claims = complete ? collectClaims(complete) : [];

  return {
    kind: "ready",
    data: state.data,
    title: state.data.title,
    overviewEn: state.data.abstract,
    overviewZh: complete?.overviewZh.text ?? null,
    interpretationState: interpretationState(interpretation),
    sourceDisclosure: complete?.sourceDisclosure ?? null,
    accessLabel: accessLabel(state.data.accessStatus),
    evidenceGroups: {
      direct: claims.filter(({ evidenceLevel }) => evidenceLevel === "direct"),
      inferred: claims.filter(({ evidenceLevel }) => evidenceLevel === "inferred"),
      uncertain: claims.filter(({ evidenceLevel }) => evidenceLevel === "uncertain"),
    },
  };
}

function collectClaims(interpretation: CompleteInterpretationDto): PresentedEvidenceClaim[] {
  return [
    presentClaim("中文概述", interpretation.overviewZh),
    presentClaim("研究问题", interpretation.researchQuestion),
    ...interpretation.innovations.map((claim) => presentClaim("创新", claim)),
    ...interpretation.methodsAndEvidence.map((claim) =>
      presentClaim("方法与证据", claim),
    ),
    ...interpretation.limitations.map((claim) => presentClaim("局限", claim)),
  ];
}

function presentClaim(
  fieldLabel: string,
  claim: EvidenceClaimDto,
): PresentedEvidenceClaim {
  return {
    ...claim,
    fieldLabel,
    confidenceLabel: confidenceLabel(claim.evidenceLevel),
  };
}

function interpretationState(
  interpretation: PaperDetailDto["interpretation"],
): "complete" | "missing" | "unavailable" {
  if (interpretation === null) {
    return "missing";
  }
  return interpretation.status;
}

function confidenceLabel(level: EvidenceLevel): "高" | "中" | "低" {
  if (level === "direct") {
    return "高";
  }
  if (level === "inferred") {
    return "中";
  }
  return "低";
}

function accessLabel(status: PaperDetailDto["accessStatus"]): string {
  if (status === "OPEN") {
    return "开放获取";
  }
  if (status === "RESTRICTED") {
    return "可能需要校园网/VPN";
  }
  return "访问状态待确认";
}
