import {
  findDuplicateCandidates,
  normalizeDoi,
  normalizeTitle,
  paperSourceInputSchema,
  type DuplicateCandidate,
  type PaperSourceInput,
} from "@pri/domain/paper";
import { PHYSICS_TAGS } from "@pri/domain/physics-tags";
import type { DatabaseClient } from "./client";

export type PaperSummary = {
  id: string;
  doi: string | null;
  title: string;
  normalizedTitle: string;
  abstract: string | null;
  journal: string | null;
  firstAuthor: string | null;
  publishedAt: Date | null;
  originalUrl: string | null;
  accessStatus: "UNKNOWN" | "OPEN" | "RESTRICTED";
  createdAt: Date;
  updatedAt: Date;
};

export type PaperSourceRecord = {
  id: string;
  sourceName: string;
  sourceRecordId: string;
  sourceUrl: string;
  retrievedAt: Date;
  licenseUrl: string | null;
};

export type PaperTagRecord = {
  slug: string;
  labelEn: string;
  labelZh: string;
  relevance: number;
  reason: string;
};

export type PaperDetails = PaperSummary & {
  sources: PaperSourceRecord[];
  tags: PaperTagRecord[];
  interpretation: {
    id: string;
    content: unknown;
    provider: string;
    model: string;
    promptVersion: string;
    createdAt: Date;
  } | null;
  userState: {
    status: "UNREAD" | "SAVED" | "READING" | "COMPLETE" | "SKIPPED";
    feedback: "NONE" | "LIKE" | "DISLIKE";
    note: string | null;
    updatedAt: Date;
  } | null;
};

export type PaperPage = {
  items: PaperSummary[];
  nextCursor: string | null;
};

export interface PaperRepository {
  upsertFromSource(input: PaperSourceInput): Promise<{
    paper: PaperSummary;
    candidateDuplicates: DuplicateCandidate[];
  }>;
  list(input: { limit: number; cursor?: string }): Promise<PaperPage>;
  findByDoi(doi: string, userId?: string): Promise<PaperDetails | null>;
}

export function createPaperRepository(client: DatabaseClient): PaperRepository {
  return {
    async upsertFromSource(rawInput) {
      const input = paperSourceInputSchema.parse(rawInput);
      const existingSource = await client.paperSource.findUnique({
        where: {
          sourceName_sourceRecordId: {
            sourceName: input.sourceName,
            sourceRecordId: input.sourceRecordId,
          },
        },
        include: { paper: true },
      });

      if (existingSource) {
        return {
          paper: toPaperSummary(existingSource.paper),
          candidateDuplicates: [],
        };
      }

      const doi = input.doi ? normalizeDoi(input.doi) : null;
      const candidateDuplicates = doi ? [] : await findNoDoiCandidates(client, input);

      const paper = await client.$transaction(async (transaction) => {
        const storedPaper = doi
          ? await transaction.paper.upsert({
              where: { doi },
              create: paperCreateData(input, doi),
              update: paperUpdateData(input),
            })
          : await transaction.paper.create({
              data: paperCreateData(input, null),
            });

        await transaction.paperSource.create({
          data: {
            paperId: storedPaper.id,
            ...paperSourceData(input),
          },
        });

        return storedPaper;
      });

      return {
        paper: toPaperSummary(paper),
        candidateDuplicates,
      };
    },

    async list({ limit, cursor }) {
      const rows = await client.paper.findMany({
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const hasNextPage = rows.length > limit;
      const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

      return {
        items: pageRows.map(toPaperSummary),
        nextCursor: hasNextPage ? (pageRows.at(-1)?.id ?? null) : null,
      };
    },

    async findByDoi(rawDoi, userId = "default") {
      const doi = normalizeDoi(rawDoi);
      const paper = await client.paper.findUnique({
        where: { doi },
        include: {
          sources: { orderBy: [{ retrievedAt: "desc" }, { id: "desc" }] },
          classifications: {
            orderBy: [
              { createdAt: "desc" },
              { relevance: "desc" },
              { tagSlug: "asc" },
            ],
            include: { tag: true },
          },
          interpretations: {
            where: { status: "COMPLETE" },
            take: 1,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              content: true,
              provider: true,
              model: true,
              promptVersion: true,
              createdAt: true,
            },
          },
          userStates: {
            where: { userId },
            take: 1,
            select: {
              status: true,
              feedback: true,
              note: true,
              updatedAt: true,
            },
          },
        },
      });

      if (!paper) {
        return null;
      }

      return {
        ...toPaperSummary(paper),
        sources: paper.sources.map((source) => ({
          id: source.id,
          sourceName: source.sourceName,
          sourceRecordId: source.sourceRecordId,
          sourceUrl: source.sourceUrl,
          retrievedAt: source.retrievedAt,
          licenseUrl: source.licenseUrl,
        })),
        tags: deduplicatePaperTags(paper.classifications).map((classification) => ({
          slug: classification.tag.slug,
          labelEn: classification.tag.labelEn,
          labelZh: classification.tag.labelZh,
          relevance: classification.relevance,
          reason: classification.reason,
        })),
        interpretation: paper.interpretations[0] ?? null,
        userState: paper.userStates[0] ?? null,
      };
    },
  };
}

export async function syncPhysicsTags(client: DatabaseClient): Promise<void> {
  await client.$transaction(
    PHYSICS_TAGS.map((tag) =>
      client.physicsTag.upsert({
        where: { slug: tag.slug },
        create: tag,
        update: tag,
      }),
    ),
  );
}

async function findNoDoiCandidates(
  client: DatabaseClient,
  input: PaperSourceInput,
): Promise<DuplicateCandidate[]> {
  if (!input.firstAuthor || !input.publishedAt) {
    return [];
  }

  const dateWindowMs = 7 * 24 * 60 * 60 * 1_000;
  const possibleMatches = await client.paper.findMany({
    where: {
      doi: null,
      firstAuthor: { not: null },
      publishedAt: {
        gte: new Date(input.publishedAt.getTime() - dateWindowMs),
        lte: new Date(input.publishedAt.getTime() + dateWindowMs),
      },
    },
    select: {
      id: true,
      title: true,
      firstAuthor: true,
      publishedAt: true,
    },
  });

  return findDuplicateCandidates(
    {
      title: input.title,
      firstAuthor: input.firstAuthor,
      publishedAt: input.publishedAt,
    },
    possibleMatches.flatMap((candidate) =>
      candidate.firstAuthor && candidate.publishedAt
        ? [
            {
              id: candidate.id,
              title: candidate.title,
              firstAuthor: candidate.firstAuthor,
              publishedAt: candidate.publishedAt,
            },
          ]
        : [],
    ),
  );
}

function paperCreateData(input: PaperSourceInput, doi: string | null) {
  return {
    doi,
    title: input.title,
    normalizedTitle: normalizeTitle(input.title),
    abstract: input.abstract ?? null,
    journal: input.journal ?? null,
    firstAuthor: input.firstAuthor ?? null,
    publishedAt: input.publishedAt ?? null,
    originalUrl: input.originalUrl ?? null,
    accessStatus: input.accessStatus,
  };
}

function paperUpdateData(input: PaperSourceInput) {
  return {
    title: input.title,
    normalizedTitle: normalizeTitle(input.title),
    ...(input.abstract ? { abstract: input.abstract } : {}),
    ...(input.journal ? { journal: input.journal } : {}),
    ...(input.firstAuthor ? { firstAuthor: input.firstAuthor } : {}),
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    ...(input.originalUrl ? { originalUrl: input.originalUrl } : {}),
    ...(input.accessStatus === "UNKNOWN" ? {} : { accessStatus: input.accessStatus }),
  };
}

function paperSourceData(input: PaperSourceInput) {
  return {
    sourceName: input.sourceName,
    sourceRecordId: input.sourceRecordId,
    sourceUrl: input.sourceUrl,
    retrievedAt: input.retrievedAt,
    licenseUrl: input.licenseUrl ?? null,
    title: input.title,
    abstract: input.abstract ?? null,
    journal: input.journal ?? null,
    firstAuthor: input.firstAuthor ?? null,
    publishedAt: input.publishedAt ?? null,
  };
}

function toPaperSummary(paper: {
  id: string;
  doi: string | null;
  title: string;
  normalizedTitle: string;
  abstract: string | null;
  journal: string | null;
  firstAuthor: string | null;
  publishedAt: Date | null;
  originalUrl: string | null;
  accessStatus: "UNKNOWN" | "OPEN" | "RESTRICTED";
  createdAt: Date;
  updatedAt: Date;
}): PaperSummary {
  return {
    id: paper.id,
    doi: paper.doi,
    title: paper.title,
    normalizedTitle: paper.normalizedTitle,
    abstract: paper.abstract,
    journal: paper.journal,
    firstAuthor: paper.firstAuthor,
    publishedAt: paper.publishedAt,
    originalUrl: paper.originalUrl,
    accessStatus: paper.accessStatus,
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
  };
}

function deduplicatePaperTags<T extends { tagSlug: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.tagSlug)) {
      return false;
    }
    seen.add(row.tagSlug);
    return true;
  });
}
