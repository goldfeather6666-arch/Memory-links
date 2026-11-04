/**
 * MNEMOSYNE Part 6 — deterministic query understanding.
 *
 * Classifies the user's question into an intent, extracts entities / time
 * references / projects / categories, picks a desired answer format, and
 * resolves simple conversational references (anaphora) against prior user
 * turns. This is fully deterministic — it never depends on an LLM.
 */

import { searchGraph } from "@/server/intelligence/graph";
import { estimateTokens } from "@/server/intelligence/cost";
import type { QueryAnalysis, QueryIntent, TimeRef } from "./types";

const RELATIVE_TIME = [
  "today",
  "yesterday",
  "last night",
  "this week",
  "last week",
  "this month",
  "last month",
  "this year",
  "last year",
  "recently",
  "recent",
  "earlier",
  "before",
  "ago",
  "now",
] as const;

const INTENT_KEYWORDS: { intent: QueryIntent; patterns: RegExp[] }[] = [
  {
    intent: "temporal_comparison",
    patterns: [
      /\bcompare\b/, /\bversus\b/, /\bvs\b/, /\bchanged\b/, /\bbefore (?:and|vs|then)\b/,
      /\bwhat (?:was|were).{0,20}\bbefore\b/, /\bbefore my current\b/, /\bswitch\b/, /\bdifferent\b/,
    ],
  },
  {
    intent: "historical",
    patterns: [
      /\b(?:before|after|during|when)\b.*\blast (?:week|month|year)\b/,
      /\bwhat (?:was|were) i (?:doing|working|using)\b/, /\bwhat happened\b/,
      /\bhistory\b/, /\bback then\b/, /\bprevious\b/, /\bprior\b/,
      /\bwhen did i\b/, /\bwhat did i (?:do|say|decide)\b/,
    ],
  },
  {
    intent: "project_summary",
    patterns: [
      /\bproject\b/, /\bplan\b/, /\bstatus\b/, /\bprogress\b/, /\boriginal plan\b/,
      /\btechnologies\b/, /\bunfinished\b/, /\bremains\b/, /\bwhat.{0,20}\bproject\b/,
    ],
  },
  {
    intent: "preference",
    patterns: [
      /\bprefer\b/, /\bpreference\b/, /\blike\b/, /\bdislike\b/, /\bfavorite\b/,
      /\bpreferred\b/, /\brecommend\b/, /\btaste\b/, /\bfavour\b/, /\bfavor\b/,
    ],
  },
  {
    intent: "relationship",
    patterns: [
      /\bconnect(?:ed|ion)?\b/, /\brelated\b/, /\brelationship\b/, /\bassociated\b/,
      /\bhow are.{0,30}connected\b/, /\bwhich people\b/, /\bwhich organizations\b/,
      /\baffect\b/, /\blinked\b/, /\battached\b/,
    ],
  },
  {
    intent: "procedure",
    patterns: [
      /\bhow did i\b/, /\bhow to\b/, /\bsteps\b/, /\bprocedure\b/, /\bworkflow\b/,
      /\bdeploy\b/, /\bprocess\b/, /\bmethod\b/, /\bapproach\b/, /\bfollow(?:ed)?\b/,
    ],
  },
  {
    intent: "factual",
    patterns: [
      /\bwhat\b/, /\bwho\b/, /\bwhich\b/, /\bwhen\b/, /\bwhere\b/,
      /\bhow\b/, /\btell me\b/, /\bmention\b/, /\b i\b/, /\bmemory\b/,
    ],
  },
];

const CATEGORY_KEYWORDS: { category: string; patterns: RegExp[] }[] = [
  { category: "project", patterns: [/\bproject\b/, /\bplan\b/, /\bdeploy\b/, /\bstack\b/, /\brepo\b/] },
  { category: "person", patterns: [/\bperson\b/, /\bpeople\b/, /\bwho\b/, /\bcolleague\b/] },
  { category: "organization", patterns: [/\borganization\b/, /\bcompany\b/, /\bfirm\b/, /\bteam\b/] },
  { category: "technology", patterns: [/\btech\b/, /\btechnology\b/, /\bsoftware\b/, /\btool\b/, /\blanguage\b/] },
  { category: "decision", patterns: [/\bdecision\b/, /\bdecide\b/, /\bchoice\b/, /\bchose\b/] },
  { category: "preference", patterns: [/\bprefer\b/, /\bpreference\b/, /\blike\b/, /\bfavorite\b/] },
  { category: "event", patterns: [/\bevent\b/, /\bhappened\b/, /\boccurred\b/, /\btrip\b/, /\bmeeting\b/] },
  { category: "workflow", patterns: [/\bworkflow\b/, /\bprocess\b/, /\bprocedure\b/, /\bsteps\b/] },
];

const FORMAT_KEYWORDS: { format: QueryAnalysis["answerFormat"]; patterns: RegExp[] }[] = [
  { format: "timeline", patterns: [/\btimeline\b/, /\bchronolog\b/, /\bsequence\b/, /\bin order\b/, /\bhistory\b/] },
  { format: "comparison", patterns: [/\bcompare\b/, /\bversus\b/, /\bvs\b/, /\bdifference\b/] },
  { format: "procedure", patterns: [/\bsteps\b/, /\bprocedure\b/, /\bhow\b/, /\bdeploy\b/] },
  { format: "list", patterns: [/\blist\b/, /\bwhich\b/, /\bwhat (?:did|was|were)\b/] },
  { format: "summary", patterns: [/\bsummary\b/, /\bsummarize\b/, /\boverview\b/, /\bstatus\b/] },
];

export function normalizeQuery(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

export function detectIntent(q: string): QueryIntent {
  for (const { intent, patterns } of INTENT_KEYWORDS) {
    if (patterns.some((re) => re.test(q))) return intent;
  }
  return "general";
}

export function detectCategories(q: string): string[] {
  const found: string[] = [];
  for (const { category, patterns } of CATEGORY_KEYWORDS) {
    if (patterns.some((re) => re.test(q))) found.push(category);
  }
  return Array.from(new Set(found));
}

export function detectAnswerFormat(q: string, intent: QueryIntent): QueryAnalysis["answerFormat"] {
  for (const { format, patterns } of FORMAT_KEYWORDS) {
    if (patterns.some((re) => re.test(q))) return format;
  }
  if (intent === "temporal_comparison") return "comparison";
  if (intent === "historical") return "timeline";
  if (intent === "procedure") return "procedure";
  if (intent === "project_summary") return "summary";
  if (intent === "preference") return "list";
  if (intent === "relationship") return "text";
  return "text";
}

export function detectTimeRefs(q: string): TimeRef[] {
  const refs: TimeRef[] = [];
  for (const word of RELATIVE_TIME) {
    if (q.includes(word)) {
      refs.push({ kind: "relative", raw: word });
    }
  }
  const iso = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) refs.push({ kind: "absolute", value: iso[1], raw: iso[1] });
  const monthYear = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4}\b/);
  if (monthYear) refs.push({ kind: "absolute", raw: monthYear[0] });
  return refs;
}

export function detectProjects(q: string, entities: string[]): string[] {
  return Array.from(new Set(entities));
}

export function detectDeepReasoning(q: string, intent: QueryIntent): boolean {
  return (
    intent === "temporal_comparison" ||
    intent === "relationship" ||
    intent === "multi_step" ||
    q.length > 160
  );
}

export function extractKeywords(q: string): string[] {
  const stop = new Set([
    "what", "when", "where", "which", "who", "how", "why", "did", "was", "were",
    "is", "are", "the", "a", "an", "and", "or", "but", "of", "to", "in",
    "on", "at", "for", "with", "my", "our", "your", "i", "me", "we", "us",
    "from", "about", "that", "this", "there", "before", "after", "during",
    "have", "has", "had", "been", "doing", "working", "using", "mentioned",
    "tell", "remember", "prefer", "like", "use", "used", "new", "old",
    "previous", "current", "recent", "recently", "other", "some", "related",
  ]);
  const words = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  return Array.from(new Set(words.filter((w) => !stop.has(w) && w.length > 2))).slice(0, 12);
}

/**
 * Resolve conversational references (anaphora) against prior user turns.
 * Intentionally simple: carries entity-like tokens from the most recent prior
 * user message forward when the current query uses deictic/pronoun references.
 */
export function resolveReferences(
  currentQuery: string,
  priorUserMessages: string[],
): string {
  const hasDeictic =
    /\b(that|the|this|those|these)\b/.test(currentQuery) ||
    /\b(issue|other|earlier|previous|version|company|project|one)\b/.test(currentQuery);
  if (!hasDeictic || priorUserMessages.length === 0) return currentQuery;
  const prior = priorUserMessages[priorUserMessages.length - 1] ?? "";
  const tokens = (prior.match(/[A-Z][A-Za-z0-9_-]{1,}/g) ?? []).filter(
    (t) => !["I", "We", "You", "The", "A", "At", "In", "On"].includes(t),
  );
  if (tokens.length === 0) return currentQuery;
  const hint = tokens.slice(0, 4).join(", ");
  return `${currentQuery} [prior context: ${hint}]`;
}

export function analyzeQuery(
  rawQuery: string,
  opts: { priorUserMessages?: string[]; knownEntities?: string[] } = {},
): QueryAnalysis {
  const raw = opts.priorUserMessages?.length ? resolveReferences(rawQuery, opts.priorUserMessages) : rawQuery;
  const q = normalizeQuery(raw);
  const intent = detectIntent(q);
  const categories = detectCategories(q);
  const answerFormat = detectAnswerFormat(q, intent);
  const timeRefs = detectTimeRefs(q);
  const keywords = extractKeywords(q);
  const requiresDeepReasoning = detectDeepReasoning(q, intent);
  const entities = opts.knownEntities ?? [];
  const projects = detectProjects(q, entities);

  const clarificationNeeded = intent === "general" && !q.trim();
  return {
    intent,
    entities,
    timeRefs,
    projects,
    categories,
    answerFormat,
    keywords,
    requiresDeepReasoning,
    requiresClarification: clarificationNeeded,
    clarificationQuestion: clarificationNeeded
      ? "Could you rephrase that? I want to search your memories for the specifics."
      : undefined,
    inputTokens: estimateTokens(rawQuery),
  };
}

export async function resolveKnownEntities(
  userId: string,
  workspaceId: string,
  query: string,
): Promise<string[]> {
  const hits = await searchGraph(userId, workspaceId, query, { limit: 8 });
  const names = hits
    .filter((n) => n.kind === "entity")
    .map((n) => n.label)
    .filter((n): n is string => Boolean(n));
  return Array.from(new Set(names)).slice(0, 8);
}
