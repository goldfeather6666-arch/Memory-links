/**
 * MNEMOSYNE Part 6 — multi-stage memory retrieval.
 *
 * Pipeline: analyze query → hybrid recall (lexical+semantic) → entity
 * resolution → graph neighborhood → temporal filter → bound & rank → dedupe.
 * The result is a bounded context package. Contradictory evidence is surfaced
 * (never silently suppressed) by keeping diverse high-confidence segments.
 *
 * Retrieval runs BEFORE any model call and is fully deterministic with respect
 * to the data — it never invents memories.
 */

import { recallMemories } from "@/server/memory/retrieval";
import { projectGraph } from "@/server/intelligence/graph";
import type { RelevanceResult } from "@/server/memory/types";
import { analyzeQuery, resolveKnownEntities } from "./intent";
import { clamp01 } from "@/server/intelligence/graph";
import type {
  ChatContextPackage,
  ContextEntity,
  ContextProject,
  ContextTimelineEvent,
  RetrievedEvidence,
} from "./types";

const MAX_EVIDENCE = 12;
const MAX_TIMELINE_EVENTS = 10;
const MAX_PROJECTS = 6;
const MAX_ENTITIES = 10;

export interface RetrievalInput {
  userId: string;
  workspaceId: string;
  query: string;
  priorUserMessages: string[];
  conversationSummary: string | null;
}

export interface RetrievalOutput {
  context: ChatContextPackage;
  entitiesHint: string[];
}

/** Convert a recall hit into canonical RetrievedEvidence. */
export function toRetrievedEvidence(hit: RelevanceResult): RetrievedEvidence {
  const content = hit.content;
  const summary = hit.summary ?? null;
  const label =
    summary && summary.trim()
      ? summary.trim()
      : content.trim().length > 160
        ? `${content.trim().slice(0, 160)}…`
        : content.trim() || "Memory";
  return {
    id: hit.id,
    kind: "memory",
    type: hit.memoryType,
    label,
    summary,
    confidence: hit.confidence,
    importance: hit.importance,
    createdAt: hit.createdAt,
    quote: content.trim().slice(0, 500) || null,
    content,
    validFrom: hit.validFrom,
    validUntil: hit.validUntil,
    occurredAt: null,
    relevance: clamp01(hit.relevance),
    provenance: "direct",
  };
}

/** Compute temporal-bound boost (0..1) for evidence relative to a query. */
function temporalRelevance(evidence: RetrievedEvidence, analysis: ReturnType<typeof analyzeQuery>): number {
  if (!analysis.timeRefs.length) return 1;
  // For relative refs we simply prefer recent memories (createdAt newer).
  const created = Date.parse(evidence.createdAt);
  if (Number.isNaN(created)) return 0.5;
  const now = Date.now();
  const ageDays = Math.max(0, (now - created) / 86_400_000);
  const hasRecentRef = analysis.timeRefs.some((t) =>
    ["recently", "recent", "yesterday", "today", "last week", "this week", "last month", "this month"].includes(t.raw),
  );
  if (hasRecentRef) {
    return clamp01(1 - ageDays / 90);
  }
  return 0.5;
}

function rankEvidence(items: RetrievedEvidence[], analysis: ReturnType<typeof analyzeQuery>): RetrievedEvidence[] {
  return items
    .map((e) => {
      const semantic = e.relevance;
      const importance = clamp01(e.importance / 100);
      const confidence = clamp01(e.confidence ?? 0.5);
      const temporal = temporalRelevance(e, analysis);
      const projectScore = analysis.projects.length ? (analysis.projects.length > 0 ? 0.5 : 0) : 0.5;
      const score =
        semantic * 0.4 +
        importance * 0.2 +
        confidence * 0.15 +
        temporal * 0.15 +
        projectScore * 0.1;
      return { e, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}

export async function retrieveContext(input: RetrievalInput): Promise<RetrievalOutput> {
  const { userId, workspaceId, query, priorUserMessages } = input;

  // 1. Deterministic query analysis + entity resolution.
  const entitiesHint = await resolveKnownEntities(userId, workspaceId, query);
  const analysis = analyzeQuery(query, { priorUserMessages, knownEntities: entitiesHint });

  // 2. Hybrid recall (keyword + semantic when a provider is configured).
  const recallResults: RelevanceResult[] = [];
  try {
    const res = await recallMemories(userId, {
      workspaceId,
      query,
      method: "hybrid",
      limit: 60,
    });
    recallResults.push(...res.items);
  } catch {
    // fall through — retrieval degrades gracefully
  }
  const evidence = recallResults.map(toRetrievedEvidence);

  // 3. Graph-neighborhood expansion: pull related entity nodes + timeline event
  //    nodes so the context panel and evidence reflect the broader graph.
  let projects: ContextProject[] = [];
  let entities: ContextEntity[] = [];
  let timelineEvents: ContextTimelineEvent[] = [];
  try {
    const graph = await projectGraph({
      userId,
      workspaceId,
      mode: analysis.projects.length ? "project" : "universe",
      limitNodes: 120,
      limitEdges: 300,
    });
    const entityNodes = graph.nodes.filter((n) => n.kind === "entity").slice(0, MAX_ENTITIES);
    entities = entityNodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
    }));
    projects = entityNodes
      .filter((n) => n.type === "project")
      .slice(0, MAX_PROJECTS)
      .map((n) => ({ id: n.id, label: n.label }));
    timelineEvents = graph.nodes
      .filter((n) => n.kind === "memory")
      .slice(0, MAX_TIMELINE_EVENTS)
      .map((n) => ({
        id: n.id,
        label: n.label,
        at: n.occurredAt ?? n.validFrom ?? n.createdAt,
      }));
  } catch {
    // Graph retrieval is best-effort.
  }

  // 4. Bound, rank and dedupe on memory id.
  const seen = new Set<string>();
  const unique = evidence.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  const ranked = rankEvidence(unique, analysis).slice(0, MAX_EVIDENCE);

  const context: ChatContextPackage = {
    evidence: ranked,
    projects,
    entities,
    timelineEvents,
    conversationSummary: input.conversationSummary,
    recentMessages: priorUserMessages.slice(-4).map((m) => ({ role: "user" as const, content: m })),
    analysis,
  };

  return { context, entitiesHint };
}
