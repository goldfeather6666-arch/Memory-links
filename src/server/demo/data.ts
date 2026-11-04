/**
 * MNEMOSYNE — Interactive Demo Universe
 *
 * Pure, typed sample data describing a coherent demo persona: Alex Morgan,
 * a Product Designer & Independent Entrepreneur. This module contains ONLY
 * data and type definitions — no DB / SQL code. Memory type values use the
 * shared `MemoryType` union from the schema so this data plugs directly into
 * the memory engine's type system.
 *
 * Referential integrity contract:
 *  - every entity referenced in `DemoMemory.entities` exists in `ENTITIES` (by name)
 *  - every evidence/relationship `*Key` value references an existing MEMORIES key
 *  - `validFrom` dates are chronological and consistent with the recorded timeline
 */

import type { MemoryType } from "@/db/schema";

export const DEMO_VERSION = "1.0.0";
export const DEMO_NAME = "MNEMOSYNE — Interactive Demo Universe";
export const DEMO_DESCRIPTION =
  "A curated demo universe for MNEMOSYNE, built around Alex Morgan, an " +
  "independent Product Designer and entrepreneur. It exercises recall, " +
  "preferences, decision support, project context, temporal reasoning, " +
  "contradiction detection and cross-project synthesis across a realistic " +
  "working memory of 160 memories, 4 projects, 8 documents and 12 " +
  "capability-focused conversations.";

export type DemoEntityType =
  | "person"
  | "organization"
  | "product"
  | "project"
  | "location"
  | "technology"
  | "event"
  | "concept";

export interface DemoEntity {
  name: string;
  type: DemoEntityType;
}

export interface DemoMemory {
  key: string;
  type: MemoryType;
  category: string;
  content: string;
  summary?: string;
  importance?: number;
  confidence?: number;
  validFrom?: string;
  validUntil?: string;
  entities?: string[];
  sourceDoc?: string;
}

export interface DemoProject {
  key: string;
  name: string;
  description: string;
  status: "active" | "planned" | "archived";
  milestones?: string[];
  decisions?: string[];
  goals?: string[];
  risks?: string[];
  progress?: number;
}

export interface DemoDocument {
  key: string;
  title: string;
  content: string;
  kind: string;
}

export interface DemoConversation {
  key: string;
  title: string;
  questions: string[];
  answer: string;
  evidenceKeys: string[];
}

export interface DemoConsolidation {
  title: string;
  summary: string;
  kind: string;
  memoryKeys: string[];
  confidence: number;
}

export interface DemoPattern {
  patternType: string;
  description: string;
  memoryKeys: string[];
}

export interface DemoContradiction {
  memoryKeyA: string;
  memoryKeyB: string;
  category: string;
  evidence: string;
}

export interface DemoSuggestion {
  suggestionType: string;
  title: string;
  body: string;
  targetKey?: string;
}

export interface DemoAgent {
  name: string;
  description: string;
  category: string;
  scopes: string[];
}

/* ---------------------------------------------------------------------------
 * ENTITIES (30) — every name referenced by MEMORIES exists here.
 * ------------------------------------------------------------------------- */

export const ENTITIES: DemoEntity[] = [
  { name: "Alex Morgan", type: "person" },
  { name: "Sam Rivera", type: "person" },
  { name: "Priya Nair", type: "person" },
  { name: "Casey Wong", type: "person" },
  { name: "Dr. Elena Petrova", type: "person" },
  { name: "Northstar Studio", type: "organization" },
  { name: "Nova Founders", type: "organization" },
  { name: "BrightPath Labs", type: "organization" },
  { name: "Cloudline", type: "organization" },
  { name: "Lumen", type: "product" },
  { name: "Rivet", type: "product" },
  { name: "AI Productivity Platform", type: "project" },
  { name: "SaaS Business Launch", type: "project" },
  { name: "Personal Learning System", type: "project" },
  { name: "Technology Research", type: "project" },
  { name: "Supabase", type: "technology" },
  { name: "Next.js", type: "technology" },
  { name: "Vector Embeddings", type: "technology" },
  { name: "Hybrid Retrieval", type: "technology" },
  { name: "Second Brain", type: "concept" },
  { name: "AI-Assisted Decision Making", type: "concept" },
  { name: "Minimum Viable Product", type: "concept" },
  { name: "Contradiction Detection", type: "concept" },
  { name: "Suggestion Fatigue", type: "concept" },
  { name: "Portland, OR", type: "location" },
  { name: "San Francisco, CA", type: "location" },
  { name: "Austin, TX", type: "location" },
  { name: "Product Week SF", type: "event" },
  { name: "Lumen Beta Launch", type: "event" },
  { name: "Design Systems Meetup", type: "event" },
];

/* ---------------------------------------------------------------------------
 * MEMORIES
 * Semantic ≈ 60, episodic ≈ 40, procedural ≈ 25, associative ≈ 35.
 * ------------------------------------------------------------------------- */

const SEMANTIC_MEMORIES: DemoMemory[] = [
  // --- Preferences (11) ---------------------------------------------------
  {
    key: "sem-p-01",
    type: "semantic",
    category: "preference",
    content:
      "Alex strongly prefers asynchronous written communication over live meetings; " +
      "essentials are documented as notes, and calls are reserved for tricky decisions.",
    summary: "Prefers async written communication over meetings.",
    importance: 4,
    confidence: 0.95,
    entities: ["Alex Morgan", "Northstar Studio"],
  },
  {
    key: "sem-p-02",
    type: "semantic",
    category: "preference",
    content:
      "Prefers a light, focused design aesthetic with clean typography and generous " +
      "whitespace for both product UI and brand work.",
    summary: "Prefers light, focused design aesthetic.",
    importance: 3,
    confidence: 0.9,
    entities: ["Alex Morgan", "Northstar Studio"],
  },
  {
    key: "sem-p-03",
    type: "semantic",
    category: "preference",
    content:
      "Prefers working in short deep-work blocks during the morning and batches all " +
      "scheduled calls into the afternoon.",
    summary: "Prefers morning deep-work blocks.",
    importance: 3,
    confidence: 0.9,
    entities: ["Alex Morgan"],
  },
  {
    key: "sem-p-04",
    type: "semantic",
    category: "preference",
    content:
      "Prefers open-source tooling and avoids vendor lock-in where practical, even if " +
      "it means a little extra setup effort.",
    summary: "Prefers open-source tools and avoiding lock-in.",
    importance: 4,
    confidence: 0.9,
    entities: ["Alex Morgan", "Supabase"],
  },
  {
    key: "sem-p-05",
    type: "semantic",
    category: "preference",
    content:
      "Keeps daily scratch notes in plain text inside a personal second-brain system " +
      "rather than a proprietary notes app.",
    summary: "Prefers plain-text notes in own second-brain.",
    importance: 3,
    confidence: 0.88,
    entities: ["Alex Morgan", "Second Brain"],
  },
  {
    key: "sem-p-06",
    type: "semantic",
    category: "preference",
    content:
      "Prefers shipping early and iterating in small cycles over orchestrating a single " +
      "big-bang launch.",
    summary: "Prefers early shipping and small iterations.",
    importance: 5,
    confidence: 0.95,
    entities: ["Alex Morgan", "Minimum Viable Product"],
  },
  {
    key: "sem-p-07",
    type: "semantic",
    category: "preference",
    content:
      "Prefers remote-first collaboration with written updates and shared dashboards; " +
      "only rarely asks teammates to align in real time.",
    summary: "Prefers remote-first collaboration.",
    importance: 3,
    confidence: 0.85,
    entities: ["Alex Morgan", "Sam Rivera"],
  },
  {
    key: "sem-p-08",
    type: "semantic",
    category: "preference",
    content:
      "Strongly dislikes administrative overhead such as spreadsheet upkeep and " +
      "prefers systems that automate bookkeeping and reporting.",
    summary: "Dislikes admin overhead; wants automation.",
    importance: 2,
    confidence: 0.8,
    entities: ["Alex Morgan"],
  },
  {
    key: "sem-p-09",
    type: "semantic",
    category: "preference",
    content:
      "Prefers to dogfood Lumen daily so product decisions come from real usage " +
      "rather than speculation.",
    summary: "Dogfoods own product daily.",
    importance: 4,
    confidence: 0.9,
    entities: ["Alex Morgan", "Lumen"],
  },
  {
    key: "sem-p-10",
    type: "semantic",
    category: "preference",
    content:
      "Prefers AI-generated meeting summaries with action items over full transcripts " +
      "and rarely re-reads raw conversation logs.",
    summary: "Prefers AI meeting summaries over full transcripts.",
    importance: 3,
    confidence: 0.85,
    entities: ["Alex Morgan", "Lumen"],
  },
  {
    key: "sem-p-11",
    type: "semantic",
    category: "preference",
    content:
      "Prefers plain-language naming and lightweight documentation over jargon-heavy " +
      "specs for internal notes.",
    summary: "Prefers plain-language docs.",
    importance: 2,
    confidence: 0.85,
    entities: ["Alex Morgan", "Northstar Studio"],
  },

  // --- Decisions (21) ------------------------------------------------------
  {
    key: "sem-d-01",
    type: "semantic",
    category: "decision",
    content:
      "Decided to build Lumen on Supabase (auth, Postgres, edge) with Next.js " +
      "App Router for the web client, chosen in January for speed and low ops cost.",
    summary: "Stack decision: Supabase + Next.js for Lumen.",
    importance: 5,
    confidence: 0.98,
    validFrom: "2025-01-14",
    entities: ["Lumen", "Supabase", "Next.js", "AI Productivity Platform"],
    sourceDoc: "doc-arch",
  },
  {
    key: "sem-d-02",
    type: "semantic",
    category: "decision",
    content:
      "Adopted hybrid retrieval combining keyword and vector search to keep recall " +
      "fast and accurate on a mixed note corpus.",
    summary: "Adopted hybrid retrieval approach.",
    importance: 5,
    confidence: 0.95,
    validFrom: "2025-02-03",
    entities: ["Lumen", "Hybrid Retrieval", "Vector Embeddings", "AI Productivity Platform"],
  },
  {
    key: "sem-d-03",
    type: "semantic",
    category: "decision",
    content:
      "Decided to launch Lumen as an invite-only beta in March to gather focused " +
      "feedback before opening up more broadly.",
    summary: "Decided on invite-only beta launch in March.",
    importance: 5,
    confidence: 0.95,
    validFrom: "2025-01-21",
    entities: ["Lumen", "Lumen Beta Launch", "Minimum Viable Product"],
  },
  {
    key: "sem-d-04",
    type: "semantic",
    category: "decision",
    content:
      "Early decision to postpone a native mobile app until after web validation, " +
      "arguing the web client could prove product-market fit first.",
    summary: "Postponed mobile app pending web validation.",
    importance: 4,
    confidence: 0.9,
    validFrom: "2025-02-17",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-d-05",
    type: "semantic",
    category: "decision",
    content:
      "Decided to shift primary focus from client consulting to building the AI " +
      "Productivity Platform, keeping only a couple of design retainers for cash flow.",
    summary: "Prioritized AI platform over consulting work.",
    importance: 5,
    confidence: 0.95,
    validFrom: "2025-01-28",
    entities: ["Alex Morgan", "AI Productivity Platform", "Northstar Studio"],
  },
  {
    key: "sem-d-06",
    type: "semantic",
    category: "decision",
    content:
      "Decided to structure the personal learning system around spaced repetition to " +
      "retain research and design knowledge long-term.",
    summary: "Chose spaced repetition for personal learning.",
    importance: 3,
    confidence: 0.9,
    validFrom: "2025-02-08",
    entities: ["Personal Learning System", "Alex Morgan"],
  },
  {
    key: "sem-d-07",
    type: "semantic",
    category: "decision",
    content:
      "Committing to a single source of truth for notes and decisions, consolidating " +
      "scattered files into one second-brain workspace.",
    summary: "Chose single source of truth for notes.",
    importance: 3,
    confidence: 0.88,
    validFrom: "2025-01-10",
    entities: ["Second Brain", "Alex Morgan"],
  },
  {
    key: "sem-d-08",
    type: "semantic",
    category: "decision",
    content:
      "Decided to bring Sam Rivera on as technical co-founder to own the backend and " +
      "infra so Alex can stay focused on product and design.",
    summary: "Partnered with Sam Rivera as technical co-founder.",
    importance: 5,
    confidence: 0.95,
    validFrom: "2025-02-01",
    entities: ["Sam Rivera", "AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-d-09",
    type: "semantic",
    category: "decision",
    content:
      "Decided to publish the design principles behind Lumen publicly to build brand " +
      "trust and attract aligned collaborators.",
    summary: "Will publish design principles publicly.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-03-05",
    entities: ["Lumen", "Northstar Studio"],
  },
  {
    key: "sem-d-10",
    type: "semantic",
    category: "decision",
    content:
      "Revised the Q2 strategy in April to double down on team-facing features after " +
      "beta users requested shared context and cross-person recall.",
    summary: "Revised strategy toward team features.",
    importance: 5,
    confidence: 0.92,
    validFrom: "2025-04-11",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-d-11",
    type: "semantic",
    category: "decision",
    content:
      "Decided to keep a free tier for solo users to support adoption while monetizing " +
      "through team and power-user plans.",
    summary: "Kept free tier for solo users.",
    importance: 4,
    confidence: 0.88,
    validFrom: "2025-03-19",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-d-12",
    type: "semantic",
    category: "decision",
    content:
      "Adopted a shape-up style six-week cycle for product planning instead of " +
      "sprint meetings, matching a preference for fewer ceremonies.",
    summary: "Adopted shape-up cycle planning.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-02-24",
    entities: ["AI Productivity Platform", "Alex Morgan"],
  },
  {
    key: "sem-d-13",
    type: "semantic",
    category: "decision",
    content:
      "Decided to phase AI features behind explicit toggles so early users can adopt " +
      "at their own pace and trust builds gradually.",
    summary: "Phasing AI features behind toggles.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-03-12",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-d-14",
    type: "semantic",
    category: "decision",
    content:
      "Standardized on ISO-8601 dates and UTC storage everywhere to make temporal " +
      "reasoning and cross-project queries unambiguous.",
    summary: "Standardized on ISO dates and UTC storage.",
    importance: 4,
    confidence: 0.95,
    validFrom: "2025-02-05",
    entities: ["Lumen", "AI Productivity Platform"],
  },
  {
    key: "sem-d-15",
    type: "semantic",
    category: "decision",
    content:
      "Made an explicit privacy decision: never use user data to train models without " +
      "opt-in consent, and honor export/delete requests automatically.",
    summary: "No training on user data without opt-in.",
    importance: 5,
    confidence: 0.98,
    validFrom: "2025-03-02",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-d-16",
    type: "semantic",
    category: "decision",
    content:
      "Decided to open-source the retrieval evaluation toolkit used to debug Lumen's " +
      "search quality, aligning with the open-source preference.",
    summary: "Will open-source retrieval evaluation toolkit.",
    importance: 3,
    confidence: 0.8,
    validFrom: "2025-03-25",
    entities: ["Lumen", "Hybrid Retrieval"],
  },
  {
    key: "sem-d-17",
    type: "semantic",
    category: "decision",
    content:
      "Later reversal: after May usage data showed heavy mobile demand from beta " +
      "users, reprioritized a mobile app ahead of some web features.",
    summary: "Reprioritized mobile app ahead of web features.",
    importance: 4,
    confidence: 0.9,
    validFrom: "2025-05-20",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-d-18",
    type: "semantic",
    category: "decision",
    content:
      "September decision to drop the free tier and move Lumen paid-only after " +
      "churn analysis showed free users rarely converted.",
    summary: "Will drop free tier in September.",
    importance: 4,
    confidence: 0.85,
    validFrom: "2025-08-28",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-d-19",
    type: "semantic",
    category: "decision",
    content:
      "Committed to relying on managed Supabase for Postgres, auth and edge to avoid " +
      "running own database servers.",
    summary: "Relied on managed Supabase.",
    importance: 4,
    confidence: 0.85,
    validFrom: "2025-01-18",
    entities: ["Supabase", "Lumen"],
  },
  {
    key: "sem-d-20",
    type: "semantic",
    category: "decision",
    content:
      "Considering self-hosting Postgres to reduce projected infra costs at scale, " +
      "which would conflict with the earlier managed-service decision.",
    summary: "Considering self-hosting Postgres to cut cost.",
    importance: 3,
    confidence: 0.7,
    validFrom: "2025-06-15",
    entities: ["Supabase", "Lumen"],
  },
  {
    key: "sem-d-21",
    type: "semantic",
    category: "decision",
    content:
      "After scope expanded to team features, decided to push the stable v1.0 " +
      "release from Q3 to Q4 to protect quality.",
    summary: "Pushed v1.0 release to Q4.",
    importance: 4,
    confidence: 0.88,
    validFrom: "2025-06-02",
    entities: ["AI Productivity Platform", "Lumen"],
  },

  // --- Goals (9) -----------------------------------------------------------
  {
    key: "sem-g-01",
    type: "semantic",
    category: "goal",
    content: "Goal: reach 200 active beta users by the end of June.",
    summary: "Target 200 active beta users by June.",
    importance: 4,
    confidence: 0.75,
    validFrom: "2025-01-30",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-g-02",
    type: "semantic",
    category: "goal",
    content: "Goal: publish a public Lumen case study by May.",
    summary: "Publish public case study by May.",
    importance: 3,
    confidence: 0.8,
    validFrom: "2025-03-08",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-g-03",
    type: "semantic",
    category: "goal",
    content:
      "Goal: ship a stable v1.0 of Lumen in Q3 with the core capture-recall-suggest " +
      "loop fully polished.",
    summary: "Ship stable v1.0 in Q3.",
    importance: 5,
    confidence: 0.7,
    validFrom: "2025-01-25",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-g-04",
    type: "semantic",
    category: "goal",
    content: "Goal: grow monthly recurring revenue to $5k by year-end.",
    summary: "Reach $5k MRR by year-end.",
    importance: 4,
    confidence: 0.6,
    validFrom: "2025-03-01",
    entities: ["Cloudline", "Rivet", "SaaS Business Launch"],
  },
  {
    key: "sem-g-05",
    type: "semantic",
    category: "goal",
    content: "Goal: finish the AI memory and retrieval research survey by end of quarter.",
    summary: "Complete AI research survey by quarter end.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-02-10",
    entities: ["Technology Research", "BrightPath Labs", "Dr. Elena Petrova"],
  },
  {
    key: "sem-g-06",
    type: "semantic",
    category: "goal",
    content: "Goal: establish a daily writing habit to support long-term personal learning.",
    summary: "Establish daily writing habit.",
    importance: 3,
    confidence: 0.7,
    validFrom: "2025-02-20",
    entities: ["Personal Learning System", "Alex Morgan"],
  },
  {
    key: "sem-g-07",
    type: "semantic",
    category: "goal",
    content:
      "Goal: sustain a sustainable four-day work week without sacrificing shipping cadence.",
    summary: "Maintain sustainable 4-day work week.",
    importance: 4,
    confidence: 0.8,
    validFrom: "2025-04-01",
    entities: ["Alex Morgan", "Northstar Studio"],
  },
  {
    key: "sem-g-08",
    type: "semantic",
    category: "goal",
    content:
      "Goal: reduce median time-to-insight for Lumen users by 30% versus manual note " +
      "search, tracked as the headline KPI.",
    summary: "Reduce time-to-insight by 30%.",
    importance: 5,
    confidence: 0.65,
    validFrom: "2025-01-15",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-g-09",
    type: "semantic",
    category: "goal",
    content: "Goal: complete ten case-study interviews with customers by July.",
    summary: "Complete ten case-study interviews by July.",
    importance: 3,
    confidence: 0.7,
    validFrom: "2025-04-18",
    entities: ["AI Productivity Platform", "Lumen"],
  },

  // --- Context (19) ----------------------------------------------------------
  {
    key: "sem-c-01",
    type: "semantic",
    category: "context",
    content:
      "Alex runs Northstar Studio as an independent product designer and entrepreneur, " +
      "currently building Lumen alongside select design clients.",
    summary: "Alex is an independent designer/entrepreneur.",
    importance: 5,
    confidence: 0.98,
    entities: ["Alex Morgan", "Northstar Studio", "Lumen"],
  },
  {
    key: "sem-c-02",
    type: "semantic",
    category: "context",
    content: "Alex is based in Portland, OR and works distributed with collaborators in SF.",
    summary: "Based in Portland; works distributed.",
    importance: 3,
    confidence: 0.95,
    entities: ["Alex Morgan", "Portland, OR", "San Francisco, CA"],
  },
  {
    key: "sem-c-03",
    type: "semantic",
    category: "context",
    content:
      "Sam Rivera is a software engineer and Alex's technical co-founder on Lumen.",
    summary: "Sam is the technical co-founder.",
    importance: 4,
    confidence: 0.95,
    entities: ["Sam Rivera", "Lumen", "AI Productivity Platform"],
  },
  {
    key: "sem-c-04",
    type: "semantic",
    category: "context",
    content:
      "Priya Nair advises Alex on positioning and go-to-market and met them at " +
      "Product Week SF.",
    summary: "Priya is a positioning/GTM mentor.",
    importance: 3,
    confidence: 0.9,
    entities: ["Priya Nair", "Product Week SF"],
  },
  {
    key: "sem-c-05",
    type: "semantic",
    category: "context",
    content:
      "Lumen targets knowledge workers overwhelmed by scattered notes who want a " +
      "single assistant-style second brain.",
    summary: "Lumen targets overloaded knowledge workers.",
    importance: 4,
    confidence: 0.9,
    entities: ["Lumen", "Second Brain", "AI Productivity Platform"],
  },
  {
    key: "sem-c-06",
    type: "semantic",
    category: "context",
    content:
      "The active research question is how AI can best support long-term memory and " +
      "retrieval for individuals and small teams.",
    summary: "Research question: AI memory and retrieval.",
    importance: 4,
    confidence: 0.9,
    entities: ["Technology Research", "BrightPath Labs"],
  },
  {
    key: "sem-c-07",
    type: "semantic",
    category: "context",
    content:
      "The Lumen prototype relies on embedding models plus keyword search to surface " +
      "related notes.",
    summary: "Prototype uses embedding models for search.",
    importance: 4,
    confidence: 0.9,
    entities: ["Lumen", "Vector Embeddings", "Hybrid Retrieval"],
  },
  {
    key: "sem-c-08",
    type: "semantic",
    category: "context",
    content:
      "Nova Founders is the coworking community where Alex regularly demos Lumen and " +
      "gets early feedback.",
    summary: "Nova Founders provides peer feedback.",
    importance: 2,
    confidence: 0.9,
    entities: ["Nova Founders", "Lumen"],
  },
  {
    key: "sem-c-09",
    type: "semantic",
    category: "context",
    content:
      "Cloudline is Alex's SaaS venture shipping the Rivet product, a separate line " +
      "from Lumen.",
    summary: "Cloudline ships the Rivet SaaS product.",
    importance: 3,
    confidence: 0.9,
    entities: ["Cloudline", "Rivet", "SaaS Business Launch"],
  },
  {
    key: "sem-c-10",
    type: "semantic",
    category: "context",
    content:
      "Lumen differentiates through proactive suggestions and contradiction detection " +
      "rather than passive search.",
    summary: "Lumen differentiates via suggestions and contradictions.",
    importance: 5,
    confidence: 0.9,
    entities: ["Lumen", "Contradiction Detection", "AI-Assisted Decision Making"],
  },
  {
    key: "sem-c-11",
    type: "semantic",
    category: "context",
    content:
      "Alex runs a weekly manual review of retrieval quality to calibrate suggestion " +
      "precision.",
    summary: "Weekly manual review of retrieval quality.",
    importance: 3,
    confidence: 0.88,
    entities: ["Alex Morgan", "Lumen"],
  },
  {
    key: "sem-c-12",
    type: "semantic",
    category: "context",
    content:
      "The personal learning system is kept separate from client and product work to " +
      "protect depth of study.",
    summary: "Personal learning is separate from client work.",
    importance: 2,
    confidence: 0.85,
    entities: ["Personal Learning System", "Alex Morgan"],
  },
  {
    key: "sem-c-13",
    type: "semantic",
    category: "context",
    content:
      "The technology research effort focuses on memory-based recommender systems and " +
      "temporal models for personal notes.",
    summary: "Research target: memory-based recommenders.",
    importance: 3,
    confidence: 0.85,
    entities: ["Technology Research", "BrightPath Labs"],
  },
  {
    key: "sem-c-14",
    type: "semantic",
    category: "context",
    content:
      "Every project maintains a decision log so choices are traceable and reviewable.",
    summary: "Decision log maintained per project.",
    importance: 3,
    confidence: 0.9,
    entities: ["Alex Morgan", "AI-Assisted Decision Making"],
  },
  {
    key: "sem-c-15",
    type: "semantic",
    category: "context",
    content: "Alex and Sam sync weekly on Fridays to align on Lumen priorities.",
    summary: "Partners sync weekly on Fridays.",
    importance: 3,
    confidence: 0.9,
    entities: ["Alex Morgan", "Sam Rivera", "Lumen"],
  },
  {
    key: "sem-c-16",
    type: "semantic",
    category: "context",
    content:
      "Lumen's core loop is capture → retrieve → suggest, feeding context back into " +
      "an evolving knowledge graph.",
    summary: "Core loop: capture, retrieve, suggest.",
    importance: 5,
    confidence: 0.9,
    entities: ["Lumen", "Second Brain"],
  },
  {
    key: "sem-c-17",
    type: "semantic",
    category: "context",
    content:
      "The weekly review specifically measures suggestion precision and flags " +
      "suggestion fatigue so iteration stays grounded.",
    summary: "Weekly review checks suggestion precision.",
    importance: 3,
    confidence: 0.85,
    entities: ["Lumen", "Suggestion Fatigue"],
  },
  {
    key: "sem-c-18",
    type: "semantic",
    category: "context",
    content:
      "A dedicated review note tracks the evolving mobile-app decision so reversals " +
      "are visible and attributed.",
    summary: "Mobile decision reversal is tracked.",
    importance: 3,
    confidence: 0.85,
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "sem-c-19",
    type: "semantic",
    category: "context",
    content:
      "Customers repeatedly value cross-project context stitching, which motivates " +
      "Lumen's unified-second-brain positioning.",
    summary: "Customers value cross-project context stitching.",
    importance: 4,
    confidence: 0.85,
    entities: ["Lumen", "Second Brain"],
  },
];

const EPISODIC_MEMORIES: DemoMemory[] = [
  {
    key: "epi-e-01",
    type: "episodic",
    category: "event",
    content:
      "Attended Product Week SF in January, where Alex met mentor Priya Nair for the " +
      "first time.",
    summary: "Met Priya at Product Week SF.",
    importance: 3,
    confidence: 0.95,
    validFrom: "2025-01-19",
    entities: ["Alex Morgan", "Priya Nair", "Product Week SF", "San Francisco, CA"],
  },
  {
    key: "epi-e-02",
    type: "episodic",
    category: "meeting",
    content:
      "January kickoff with Sam Rivera defined the Lumen architecture and the " +
      "Supabase + Next.js stack.",
    summary: "Kickoff defined Lumen architecture.",
    importance: 4,
    confidence: 0.95,
    validFrom: "2025-01-14",
    entities: ["Sam Rivera", "Lumen", "AI Productivity Platform", "Supabase"],
  },
  {
    key: "epi-e-03",
    type: "episodic",
    category: "meeting",
    content:
      "February requirements review with prospective beta users sharpened the MVP " +
      "scope to capture-recall-suggest.",
    summary: "Requirements review with beta users.",
    importance: 4,
    confidence: 0.92,
    validFrom: "2025-02-14",
    entities: ["Lumen", "Minimum Viable Product", "AI Productivity Platform"],
  },
  {
    key: "epi-e-04",
    type: "episodic",
    category: "event",
    content:
      "The Lumen private beta went live in March with roughly forty invitees.",
    summary: "Lumen private beta launched in March.",
    importance: 5,
    confidence: 0.98,
    validFrom: "2025-03-10",
    entities: ["Lumen", "Lumen Beta Launch"],
  },
  {
    key: "epi-e-05",
    type: "episodic",
    category: "conversation",
    content:
      "User interview with a designer who kept notes scattered across five tools and " +
      "wanted one searchable place.",
    summary: "Interview surfaced scattered-notes pain.",
    importance: 4,
    confidence: 0.9,
    validFrom: "2025-03-17",
    entities: ["Lumen", "Second Brain"],
  },
  {
    key: "epi-e-06",
    type: "episodic",
    category: "experiment",
    content:
      "A/B tested suggestion-card placement; inline suggestions after capture won " +
      "over a dedicated sidebar.",
    summary: "A/B test favored inline suggestions.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-03-24",
    entities: ["Lumen", "Suggestion Fatigue"],
  },
  {
    key: "epi-e-07",
    type: "episodic",
    category: "moment",
    content:
      "First live demo of Lumen at Nova Founders drew warm feedback and two early " +
      "beta signups.",
    summary: "First Nova Founders demo went well.",
    importance: 3,
    confidence: 0.9,
    validFrom: "2025-03-05",
    entities: ["Nova Founders", "Lumen"],
  },
  {
    key: "epi-e-08",
    type: "episodic",
    category: "meeting",
    content:
      "April strategy revision session concluded that team features should be the " +
      "priority for Q2.",
    summary: "April strategy revision favored team features.",
    importance: 5,
    confidence: 0.92,
    validFrom: "2025-04-11",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "epi-e-09",
    type: "episodic",
    category: "conversation",
    content:
      "Mentor call with Priya Nair reframed Lumen's positioning around trust and " +
      "proactive assistance.",
    summary: "Priya advised on trust-based positioning.",
    importance: 4,
    confidence: 0.9,
    validFrom: "2025-03-20",
    entities: ["Priya Nair", "Lumen"],
  },
  {
    key: "epi-e-10",
    type: "episodic",
    category: "event",
    content:
      "Published the Lumen design principles post to the studio blog in March.",
    summary: "Published design principles post.",
    importance: 2,
    confidence: 0.92,
    validFrom: "2025-03-28",
    entities: ["Northstar Studio", "Lumen"],
  },
  {
    key: "epi-e-11",
    type: "episodic",
    category: "meeting",
    content:
      "A sprint review presented usage metrics showing recall depth improving after " +
      "hybrid retrieval shipped.",
    summary: "Sprint review showed improving recall.",
    importance: 3,
    confidence: 0.88,
    validFrom: "2025-04-02",
    entities: ["Lumen", "Hybrid Retrieval"],
  },
  {
    key: "epi-e-12",
    type: "episodic",
    category: "moment",
    content:
      "After reviewing May analytics, Alex realized mobile usage was far higher than " +
      "assumed, which triggered the mobile reversal.",
    summary: "May data revealed strong mobile demand.",
    importance: 4,
    confidence: 0.9,
    validFrom: "2025-05-15",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "epi-e-13",
    type: "episodic",
    category: "conversation",
    content:
      "Discussed the Supabase migration with Sam; confirmed edge auth and Postgres " +
      "fits the no-ops goal.",
    summary: "Confirmed Supabase approach with Sam.",
    importance: 3,
    confidence: 0.9,
    validFrom: "2025-02-03",
    entities: ["Sam Rivera", "Supabase", "Lumen"],
  },
  {
    key: "epi-e-14",
    type: "episodic",
    category: "event",
    content:
      "Spoke about design-system tokens at the Design Systems Meetup, connecting with " +
      "other product designers.",
    summary: "Talked at Design Systems Meetup.",
    importance: 2,
    confidence: 0.9,
    validFrom: "2025-02-26",
    entities: ["Design Systems Meetup", "San Francisco, CA"],
  },
  {
    key: "epi-e-15",
    type: "episodic",
    category: "meeting",
    content:
      "A decision-log review flagged the earlier mobile decision as stale and due " +
      "for re-evaluation.",
    summary: "Review flagged stale mobile decision.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-05-18",
    entities: ["AI-Assisted Decision Making", "AI Productivity Platform"],
  },
  {
    key: "epi-e-16",
    type: "episodic",
    category: "moment",
    content:
      "First time Lumen correctly surfaced an old decision during a planning session; " +
      "a genuine aha moment for the concept.",
    summary: "Retrieval surfaced old decision correctly.",
    importance: 4,
    confidence: 0.85,
    validFrom: "2025-04-20",
    entities: ["Lumen", "AI-Assisted Decision Making"],
  },
  {
    key: "epi-e-17",
    type: "episodic",
    category: "conversation",
    content:
      "Interviewed Dr. Elena Petrova of BrightPath Labs about memory modeling, which " +
      "shaped the research survey.",
    summary: "Interviewed Dr. Elena about memory modeling.",
    importance: 4,
    confidence: 0.9,
    validFrom: "2025-02-12",
    entities: ["Dr. Elena Petrova", "BrightPath Labs", "Technology Research"],
  },
  {
    key: "epi-e-18",
    type: "episodic",
    category: "meeting",
    content:
      "Weekly Friday sync with Sam where the hybrid retrieval rollout plan was agreed.",
    summary: "Friday sync planned hybrid retrieval rollout.",
    importance: 3,
    confidence: 0.9,
    validFrom: "2025-02-07",
    entities: ["Alex Morgan", "Sam Rivera", "Lumen"],
  },
  {
    key: "epi-e-19",
    type: "episodic",
    category: "experiment",
    content:
      "Measured retrieval latency across RAG variants; a tuned hybrid approach cut " +
      "p95 latency by 40%.",
    summary: "Hybrid retrieval cut p95 latency 40%.",
    importance: 4,
    confidence: 0.85,
    validFrom: "2025-03-30",
    entities: ["Lumen", "Hybrid Retrieval", "Vector Embeddings"],
  },
  {
    key: "epi-e-20",
    type: "episodic",
    category: "moment",
    content:
      "A beta user reported that a contradiction suggestion caught a stale doc before " +
      "it misled the team.",
    summary: "User praised contradiction detection.",
    importance: 4,
    confidence: 0.88,
    validFrom: "2025-04-25",
    entities: ["Lumen", "Contradiction Detection"],
  },
  {
    key: "epi-e-21",
    type: "episodic",
    category: "event",
    content:
      "Attended an Austin tech meetup and met a potential Rivet design client.",
    summary: "Met potential client at Austin meetup.",
    importance: 2,
    confidence: 0.85,
    validFrom: "2025-03-15",
    entities: ["Austin, TX", "Rivet", "Cloudline"],
  },
  {
    key: "epi-e-22",
    type: "episodic",
    category: "conversation",
    content:
      "Call with Casey Wong about a branding refresh for an upcoming product launch.",
    summary: "Discussed branding refresh with Casey.",
    importance: 2,
    confidence: 0.85,
    validFrom: "2025-04-08",
    entities: ["Casey Wong", "Northstar Studio"],
  },
  {
    key: "epi-e-23",
    type: "episodic",
    category: "meeting",
    content:
      "Weekly learning-block review showed spaced-repetition retention improving for " +
      "research notes.",
    summary: "Weekly learning review showed gains.",
    importance: 2,
    confidence: 0.85,
    validFrom: "2025-04-15",
    entities: ["Personal Learning System", "Alex Morgan"],
  },
  {
    key: "epi-e-24",
    type: "episodic",
    category: "moment",
    content:
      "Ran a no-meeting-Wednesdays experiment and found deep-work output rose sharply.",
    summary: "No-meeting Wednesdays boosted output.",
    importance: 3,
    confidence: 0.9,
    validFrom: "2025-04-22",
    entities: ["Alex Morgan", "Northstar Studio"],
  },
  {
    key: "epi-e-25",
    type: "episodic",
    category: "experiment",
    content:
      "Piloted spaced repetition for the personal research notes and measured higher " +
      "long-term recall in reviews.",
    summary: "Spaced-repetition pilot improved recall.",
    importance: 3,
    confidence: 0.88,
    validFrom: "2025-05-02",
    entities: ["Personal Learning System", "Alex Morgan"],
  },
  {
    key: "epi-e-26",
    type: "episodic",
    category: "conversation",
    content:
      "A user chat highlighted how cross-project recall connected a design note to " +
      "a related goal.",
    summary: "User highlighted cross-project recall value.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-05-06",
    entities: ["Lumen", "Second Brain"],
  },
  {
    key: "epi-e-27",
    type: "episodic",
    category: "event",
    content:
      "Demoed the Lumen v0.9 milestone to advisors, who pushed on privacy and trust " +
      "posture.",
    summary: "Advisor demo focused on trust.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-05-09",
    entities: ["Lumen", "AI Productivity Platform"],
  },
  {
    key: "epi-e-28",
    type: "episodic",
    category: "meeting",
    content:
      "Roadmap prioritization session led to scheduling the mobile work after web " +
      "stabilization.",
    summary: "Roadmap session scheduled mobile work.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-05-21",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "epi-e-29",
    type: "episodic",
    category: "moment",
    content: "Hit 150 active beta users in mid-May, ahead of the June target pace.",
    summary: "Reached 150 active beta users.",
    importance: 4,
    confidence: 0.9,
    validFrom: "2025-05-15",
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "epi-e-30",
    type: "episodic",
    category: "experiment",
    content:
      "Compared two embedding models offline; chose the smaller model for cost after " +
      "quality parity.",
    summary: "Chose smaller embedding model after comparison.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-03-22",
    entities: ["Lumen", "Vector Embeddings"],
  },
  {
    key: "epi-e-31",
    type: "episodic",
    category: "conversation",
    content:
      "Reviewed a beta-cohort feedback thread about suggestion frequency and tone.",
    summary: "Reviewed beta feedback on suggestion tone.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-04-29",
    entities: ["Lumen", "Suggestion Fatigue"],
  },
  {
    key: "epi-e-32",
    type: "episodic",
    category: "meeting",
    content:
      "Terms and privacy review session aligned the no-training-without-opt-in " +
      "commitment with legal language.",
    summary: "Privacy terms session aligned commitments.",
    importance: 3,
    confidence: 0.88,
    validFrom: "2025-03-02",
    entities: ["Lumen", "AI Productivity Platform"],
  },
  {
    key: "epi-e-33",
    type: "episodic",
    category: "moment",
    content:
      "After a pricing test, Alex decided to keep the free tier despite analyst " +
      "pressure to go paid-first.",
    summary: "Kept free tier after pricing test.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-03-29",
    entities: ["Lumen", "AI Productivity Platform"],
  },
  {
    key: "epi-e-34",
    type: "episodic",
    category: "event",
    content: "Shipped the decision-log integration update that links memories to choices.",
    summary: "Shipped decision-log integration.",
    importance: 3,
    confidence: 0.88,
    validFrom: "2025-05-12",
    entities: ["Lumen", "AI-Assisted Decision Making"],
  },
  {
    key: "epi-e-35",
    type: "episodic",
    category: "conversation",
    content:
      "Onboarding call with a new power user revealed a strong interest in team " +
      "shared context.",
    summary: "Power user wanted team shared context.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-05-25",
    entities: ["Lumen", "AI Productivity Platform"],
  },
  {
    key: "epi-e-36",
    type: "episodic",
    category: "meeting",
    content:
      "Retrospective surfaced that some users found an excess of suggestions caused " +
      "suggestion fatigue.",
    summary: "Retrospective surfaced suggestion fatigue.",
    importance: 3,
    confidence: 0.88,
    validFrom: "2025-04-30",
    entities: ["Lumen", "Suggestion Fatigue"],
  },
  {
    key: "epi-e-37",
    type: "episodic",
    category: "moment",
    content:
      "Automated meeting summaries saved roughly three hours a week across the studio.",
    summary: "Meeting summaries saved ~3h/week.",
    importance: 3,
    confidence: 0.9,
    validFrom: "2025-02-28",
    entities: ["Lumen", "Northstar Studio"],
  },
  {
    key: "epi-e-38",
    type: "episodic",
    category: "experiment",
    content:
      "Ran a query-latency benchmarking suite that became the basis of performance " +
      "budgets.",
    summary: "Built latency benchmarking suite.",
    importance: 3,
    confidence: 0.85,
    validFrom: "2025-03-27",
    entities: ["Lumen", "Hybrid Retrieval"],
  },
  {
    key: "epi-e-39",
    type: "episodic",
    category: "conversation",
    content:
      "Client discussion about a brand refresh for a launch helped define studio " +
      "positioning too.",
    summary: "Client brand discussion shaped positioning.",
    importance: 2,
    confidence: 0.8,
    validFrom: "2025-04-08",
    entities: ["Casey Wong", "Northstar Studio"],
  },
  {
    key: "epi-e-40",
    type: "episodic",
    category: "moment",
    content:
      "By May, the four-day work week had become a steady rhythm across the studio.",
    summary: "4-day work week became steady rhythm.",
    importance: 2,
    confidence: 0.85,
    validFrom: "2025-05-01",
    entities: ["Alex Morgan", "Northstar Studio"],
  },
];

const PROCEDURAL_MEMORIES: DemoMemory[] = [
  {
    key: "proc-pr-01",
    type: "procedural",
    category: "workflow",
    content: "How to create a new memory workspace and seed it with entity types.",
    summary: "Create a new memory workspace.",
    importance: 3,
    confidence: 0.9,
    entities: ["Lumen", "Second Brain"],
  },
  {
    key: "proc-pr-02",
    type: "procedural",
    category: "workflow",
    content:
      "Daily capture routine: jot bullet notes each evening, then tag entities and " +
      "finalize into the capture queue.",
    summary: "Daily capture routine.",
    importance: 4,
    confidence: 0.9,
    entities: ["Alex Morgan", "Second Brain"],
  },
  {
    key: "proc-pr-03",
    type: "procedural",
    category: "workflow",
    content:
      "Weekly consolidation workflow: review new memories, merge duplicates, and " +
      "write one consolidation summary per theme.",
    summary: "Weekly consolidation workflow.",
    importance: 4,
    confidence: 0.88,
    entities: ["Lumen", "Alex Morgan"],
  },
  {
    key: "proc-pr-04",
    type: "procedural",
    category: "workflow",
    content:
      "Meeting summary generation procedure: feed transcript to model, extract " +
      "actions and decisions, then file under the source meeting.",
    summary: "Meeting summary generation procedure.",
    importance: 3,
    confidence: 0.9,
    entities: ["Lumen", "Northstar Studio"],
  },
  {
    key: "proc-pr-05",
    type: "procedural",
    category: "workflow",
    content:
      "How to run the retrieval evaluation toolkit against a sample query set and read " +
      "precision/recall output.",
    summary: "Run retrieval evaluation toolkit.",
    importance: 4,
    confidence: 0.85,
    entities: ["Lumen", "Hybrid Retrieval"],
  },
  {
    key: "proc-pr-06",
    type: "procedural",
    category: "workflow",
    content: "Export procedure for a full backup of memories and entities as JSON.",
    summary: "Export memories backup.",
    importance: 3,
    confidence: 0.9,
    entities: ["Lumen"],
  },
  {
    key: "proc-pr-07",
    type: "procedural",
    category: "workflow",
    content:
      "Local dev environment setup for Lumen with Supabase CLI and Next.js dev server.",
    summary: "Set up local dev environment.",
    importance: 3,
    confidence: 0.9,
    entities: ["Supabase", "Next.js", "Lumen"],
  },
  {
    key: "proc-pr-08",
    type: "procedural",
    category: "workflow",
    content:
      "How to trigger and monitor an embedding-index build job for a workspace.",
    summary: "Build an embedding index job.",
    importance: 3,
    confidence: 0.85,
    entities: ["Lumen", "Vector Embeddings"],
  },
  {
    key: "proc-pr-09",
    type: "procedural",
    category: "workflow",
    content:
      "Contradiction review: open the queue, confirm each pair is real, then mark " +
      "resolved or escalate.",
    summary: "Review contradictions queue.",
    importance: 4,
    confidence: 0.88,
    entities: ["Lumen", "Contradiction Detection"],
  },
  {
    key: "proc-pr-10",
    type: "procedural",
    category: "workflow",
    content:
      "Publishing design-token updates: edit tokens, bump version, regenerate docs, " +
      "then commit.",
    summary: "Publish design token updates.",
    importance: 2,
    confidence: 0.85,
    entities: ["Northstar Studio", "Lumen"],
  },
  {
    key: "proc-pr-11",
    type: "procedural",
    category: "workflow",
    content:
      "Beta release checklist: verify auth, run retrieval smoke tests, check privacy " +
      "defaults, then ship.",
    summary: "Beta release checklist.",
    importance: 4,
    confidence: 0.9,
    entities: ["Lumen", "Lumen Beta Launch"],
  },
  {
    key: "proc-pr-12",
    type: "procedural",
    category: "workflow",
    content:
      "Conducting user interviews: prepare a script, record with consent, then tag " +
      "insights into the memory system.",
    summary: "Conduct user interviews.",
    importance: 3,
    confidence: 0.85,
    entities: ["Alex Morgan", "Lumen"],
  },
  {
    key: "proc-pr-13",
    type: "procedural",
    category: "workflow",
    content:
      "How to compute MRR from the ledger each month, separating Rivet from Lumen " +
      "revenue.",
    summary: "Compute MRR from ledger.",
    importance: 3,
    confidence: 0.88,
    entities: ["Cloudline", "Rivet", "Lumen"],
  },
  {
    key: "proc-pr-14",
    type: "procedural",
    category: "workflow",
    content:
      "Writing decision-log entries: state the problem, the option chosen, rationale, " +
      "and date.",
    summary: "Write decision-log entries.",
    importance: 4,
    confidence: 0.9,
    entities: ["AI-Assisted Decision Making", "Alex Morgan"],
  },
  {
    key: "proc-pr-15",
    type: "procedural",
    category: "workflow",
    content: "Archiving resolved tasks: mark done, link final outcome, and close loop.",
    summary: "Archive resolved tasks.",
    importance: 2,
    confidence: 0.85,
    entities: ["Lumen"],
  },
  {
    key: "proc-pr-16",
    type: "procedural",
    category: "workflow",
    content:
      "Onboarding a new collaborator: grant scoped access, share conventions, and " +
      "record initial context.",
    summary: "Onboard a new collaborator.",
    importance: 3,
    confidence: 0.85,
    entities: ["Northstar Studio", "Lumen"],
  },
  {
    key: "proc-pr-17",
    type: "procedural",
    category: "workflow",
    content:
      "Triaging support requests: categorize, attach relevant memories, and escalate " +
      "only when needed.",
    summary: "Triage support requests.",
    importance: 2,
    confidence: 0.85,
    entities: ["Lumen"],
  },
  {
    key: "proc-pr-18",
    type: "procedural",
    category: "workflow",
    content:
      "Rehearsing the demo flow against a checklist of capabilities before demos.",
    summary: "Rehearse demo flow.",
    importance: 2,
    confidence: 0.85,
    entities: ["Lumen", "Alex Morgan"],
  },
  {
    key: "proc-pr-19",
    type: "procedural",
    category: "workflow",
    content:
      "How to schedule spaced-repetition reviews for learning notes each week.",
    summary: "Schedule spaced-repetition reviews.",
    importance: 3,
    confidence: 0.88,
    entities: ["Personal Learning System", "Alex Morgan"],
  },
  {
    key: "proc-pr-20",
    type: "procedural",
    category: "workflow",
    content:
      "Fallback procedure when the database is unreachable: serve cached data and " +
      "fail open rather than erroring.",
    summary: "Fallback when DB unreachable.",
    importance: 4,
    confidence: 0.88,
    entities: ["Lumen", "Supabase"],
  },
  {
    key: "proc-pr-21",
    type: "procedural",
    category: "workflow",
    content: "How to restore a workspace from the latest snapshot.",
    summary: "Restore from snapshot.",
    importance: 3,
    confidence: 0.9,
    entities: ["Lumen"],
  },
  {
    key: "proc-pr-22",
    type: "procedural",
    category: "workflow",
    content:
      "Health-checking connectors and data sources before a sync run.",
    summary: "Health-check connectors.",
    importance: 2,
    confidence: 0.85,
    entities: ["Lumen"],
  },
  {
    key: "proc-pr-23",
    type: "procedural",
    category: "workflow",
    content:
      "Planning a cycle with shape-up: pitch, scope, then timebox to six weeks.",
    summary: "Plan a shape-up cycle.",
    importance: 3,
    confidence: 0.85,
    entities: ["AI Productivity Platform", "Alex Morgan"],
  },
  {
    key: "proc-pr-24",
    type: "procedural",
    category: "workflow",
    content:
      "Handling a privacy or data-export request end-to-end within the agreed SLA.",
    summary: "Handle privacy/data-export request.",
    importance: 4,
    confidence: 0.9,
    entities: ["Lumen", "AI Productivity Platform"],
  },
  {
    key: "proc-pr-25",
    type: "procedural",
    category: "workflow",
    content:
      "Recalibrating confidence thresholds after each weekly retrieval quality review.",
    summary: "Recalibrate confidence thresholds.",
    importance: 3,
    confidence: 0.85,
    entities: ["Lumen", "Alex Morgan"],
  },
];

const ASSOCIATIVE_MEMORIES: DemoMemory[] = [
  {
    key: "asso-a-01",
    type: "associative",
    category: "link",
    content: "Lumen is a concrete realization of the second-brain concept.",
    summary: "Lumen ↔ second brain.",
    importance: 4,
    confidence: 0.9,
    entities: ["Lumen", "Second Brain"],
  },
  {
    key: "asso-a-02",
    type: "associative",
    category: "link",
    content: "Alex is the creator and product lead of Lumen.",
    summary: "Alex ↔ Lumen creator.",
    importance: 4,
    confidence: 0.98,
    entities: ["Alex Morgan", "Lumen"],
  },
  {
    key: "asso-a-03",
    type: "associative",
    category: "link",
    content: "Sam Rivera owns Lumen engineering and infrastructure.",
    summary: "Sam ↔ Lumen engineering.",
    importance: 3,
    confidence: 0.95,
    entities: ["Sam Rivera", "Lumen"],
  },
  {
    key: "asso-a-04",
    type: "associative",
    category: "link",
    content: "Priya Nair advises on positioning and go-to-market for Lumen.",
    summary: "Priya ↔ Lumen positioning advisor.",
    importance: 3,
    confidence: 0.9,
    entities: ["Priya Nair", "Lumen"],
  },
  {
    key: "asso-a-05",
    type: "associative",
    category: "link",
    content: "Rivet is the product shipped by Cloudline, distinct from Lumen.",
    summary: "Rivet ↔ Cloudline.",
    importance: 3,
    confidence: 0.9,
    entities: ["Rivet", "Cloudline"],
  },
  {
    key: "asso-a-06",
    type: "associative",
    category: "link",
    content:
      "Alex's base in Portland supports remote-first collaboration across time zones.",
    summary: "Portland ↔ remote work.",
    importance: 2,
    confidence: 0.85,
    entities: ["Portland, OR", "Alex Morgan"],
  },
  {
    key: "asso-a-07",
    type: "associative",
    category: "link",
    content: "Product Week SF is where Alex first met Priya.",
    summary: "Product Week SF ↔ met Priya.",
    importance: 2,
    confidence: 0.9,
    entities: ["Product Week SF", "Priya Nair"],
  },
  {
    key: "asso-a-08",
    type: "associative",
    category: "link",
    content: "The March beta launch maps to the recorded March timeline milestones.",
    summary: "Beta launch ↔ March timeline.",
    importance: 3,
    confidence: 0.92,
    entities: ["Lumen Beta Launch", "Lumen"],
  },
  {
    key: "asso-a-09",
    type: "associative",
    category: "link",
    content:
      "The mobile decision was recorded, then reversed — linking the two memories.",
    summary: "Mobile decision ↔ reversal.",
    importance: 4,
    confidence: 0.9,
    entities: ["AI Productivity Platform", "Lumen"],
  },
  {
    key: "asso-a-10",
    type: "associative",
    category: "link",
    content: "Lumen's recommendation engine depends on the hybrid retrieval layer.",
    summary: "Recommendation engine ↔ retrieval.",
    importance: 4,
    confidence: 0.88,
    entities: ["Lumen", "Hybrid Retrieval"],
  },
  {
    key: "asso-a-11",
    type: "associative",
    category: "link",
    content: "The free tier supports acquisition and seed adoption for Lumen.",
    summary: "Free tier ↔ acquisition.",
    importance: 3,
    confidence: 0.85,
    entities: ["Lumen", "AI Productivity Platform"],
  },
  {
    key: "asso-a-12",
    type: "associative",
    category: "link",
    content: "Spaced repetition underpins the personal learning system.",
    summary: "Spaced repetition ↔ learning system.",
    importance: 3,
    confidence: 0.88,
    entities: ["Personal Learning System"],
  },
  {
    key: "asso-a-13",
    type: "associative",
    category: "link",
    content: "The research survey connects to BrightPath Labs and Dr. Elena.",
    summary: "Research survey ↔ BrightPath.",
    importance: 3,
    confidence: 0.9,
    entities: ["BrightPath Labs", "Dr. Elena Petrova", "Technology Research"],
  },
  {
    key: "asso-a-14",
    type: "associative",
    category: "link",
    content:
      "Published design principles reinforce Lumen's brand voice and trust posture.",
    summary: "Design principles ↔ brand voice.",
    importance: 2,
    confidence: 0.85,
    entities: ["Lumen", "Northstar Studio"],
  },
  {
    key: "asso-a-15",
    type: "associative",
    category: "link",
    content:
      "Suggestion fatigue fed UI iteration and a quieter suggestion cadence.",
    summary: "Suggestion fatigue ↔ UI iteration.",
    importance: 3,
    confidence: 0.85,
    entities: ["Suggestion Fatigue", "Lumen"],
  },
  {
    key: "asso-a-16",
    type: "associative",
    category: "link",
    content:
      "Cross-project context stitching is a differentiator for teams using Lumen.",
    summary: "Cross-project context ↔ team value.",
    importance: 4,
    confidence: 0.85,
    entities: ["Lumen", "Second Brain"],
  },
  {
    key: "asso-a-17",
    type: "associative",
    category: "link",
    content:
      "Temporal reasoning is positioned as a headline capability of Lumen.",
    summary: "Temporal reasoning ↔ headline capability.",
    importance: 4,
    confidence: 0.9,
    entities: ["Lumen", "AI-Assisted Decision Making"],
  },
  {
    key: "asso-a-18",
    type: "associative",
    category: "link",
    content:
      "Contradiction detection strengthens user trust in Lumen's answers.",
    summary: "Contradiction detection ↔ trust.",
    importance: 4,
    confidence: 0.88,
    entities: ["Contradiction Detection", "Lumen"],
  },
  {
    key: "asso-a-19",
    type: "associative",
    category: "link",
    content: "No-meeting Wednesdays protect deep-work focus.",
    summary: "No-meeting Wednesday ↔ focus.",
    importance: 2,
    confidence: 0.88,
    entities: ["Alex Morgan", "Northstar Studio"],
  },
  {
    key: "asso-a-20",
    type: "associative",
    category: "link",
    content: "Dogfooding Lumen yields a constant source of product feedback.",
    summary: "Dogfooding ↔ feedback.",
    importance: 3,
    confidence: 0.9,
    entities: ["Lumen", "Alex Morgan"],
  },
  {
    key: "asso-a-21",
    type: "associative",
    category: "link",
    content: "Async communication suits the distributed, remote-first team.",
    summary: "Async comms ↔ distributed team.",
    importance: 3,
    confidence: 0.88,
    entities: ["Alex Morgan", "Sam Rivera"],
  },
  {
    key: "asso-a-22",
    type: "associative",
    category: "link",
    content: "Vector embeddings power the semantic side of Lumen search.",
    summary: "Vector embeddings ↔ semantic search.",
    importance: 4,
    confidence: 0.9,
    entities: ["Vector Embeddings", "Lumen"],
  },
  {
    key: "asso-a-23",
    type: "associative",
    category: "link",
    content: "The decision log provides accountability across projects.",
    summary: "Decision log ↔ accountability.",
    importance: 3,
    confidence: 0.88,
    entities: ["AI-Assisted Decision Making"],
  },
  {
    key: "asso-a-24",
    type: "associative",
    category: "link",
    content: "The public case study supports marketing and hiring.",
    summary: "Case study ↔ marketing.",
    importance: 2,
    confidence: 0.85,
    entities: ["Lumen", "AI Productivity Platform"],
  },
  {
    key: "asso-a-25",
    type: "associative",
    category: "link",
    content: "A tight MVP scope keeps early iterations fast.",
    summary: "MVP scope ↔ speed.",
    importance: 3,
    confidence: 0.88,
    entities: ["Minimum Viable Product", "Lumen"],
  },
  {
    key: "asso-a-26",
    type: "associative",
    category: "link",
    content: "Supabase is the core backend choice for Lumen.",
    summary: "Supabase ↔ stack choice.",
    importance: 3,
    confidence: 0.95,
    entities: ["Supabase", "Lumen"],
  },
  {
    key: "asso-a-27",
    type: "associative",
    category: "link",
    content: "Next.js is the application framework for Lumen's web client.",
    summary: "Next.js ↔ app framework.",
    importance: 3,
    confidence: 0.95,
    entities: ["Next.js", "Lumen"],
  },
  {
    key: "asso-a-28",
    type: "associative",
    category: "link",
    content: "User interviews drive Lumen's discovery and roadmap.",
    summary: "User interview ↔ discovery.",
    importance: 3,
    confidence: 0.85,
    entities: ["Alex Morgan", "Lumen"],
  },
  {
    key: "asso-a-29",
    type: "associative",
    category: "link",
    content:
      "The no-training-without-opt-in rule anchors Lumen's data-ownership posture.",
    summary: "Data ownership ↔ trust posture.",
    importance: 4,
    confidence: 0.95,
    entities: ["Lumen", "AI Productivity Platform"],
  },
  {
    key: "asso-a-30",
    type: "associative",
    category: "link",
    content: "A sustainable four-day week supports long-term output.",
    summary: "4-day week ↔ sustainability.",
    importance: 2,
    confidence: 0.85,
    entities: ["Alex Morgan", "Northstar Studio"],
  },
  {
    key: "asso-a-31",
    type: "associative",
    category: "link",
    content: "Proactive suggestions are Lumen's core value proposition.",
    summary: "Proactive suggestions ↔ value prop.",
    importance: 5,
    confidence: 0.9,
    entities: ["Lumen", "AI-Assisted Decision Making"],
  },
  {
    key: "asso-a-32",
    type: "associative",
    category: "link",
    content:
      "Knowledge-worker personas are Lumen's primary target segment.",
    summary: "Knowledge workers ↔ segment.",
    importance: 3,
    confidence: 0.88,
    entities: ["Lumen", "Second Brain"],
  },
  {
    key: "asso-a-33",
    type: "associative",
    category: "link",
    content: "Retrospectives feed continuous improvement into the team.",
    summary: "Retrospective ↔ improvement.",
    importance: 2,
    confidence: 0.85,
    entities: ["Alex Morgan", "Sam Rivera"],
  },
  {
    key: "asso-a-34",
    type: "associative",
    category: "link",
    content: "The release checklist acts as a quality gate before shipping.",
    summary: "Release checklist ↔ quality gate.",
    importance: 3,
    confidence: 0.88,
    entities: ["Lumen", "Lumen Beta Launch"],
  },
  {
    key: "asso-a-35",
    type: "associative",
    category: "link",
    content:
      "Design client work funds the studio while Lumen ramps.",
    summary: "Client work ↔ studio revenue.",
    importance: 3,
    confidence: 0.85,
    entities: ["Northstar Studio", "Casey Wong"],
  },
];

export const MEMORIES: DemoMemory[] = [
  ...SEMANTIC_MEMORIES,
  ...EPISODIC_MEMORIES,
  ...PROCEDURAL_MEMORIES,
  ...ASSOCIATIVE_MEMORIES,
];

/* ---------------------------------------------------------------------------
 * PROJECTS (4)
 * ------------------------------------------------------------------------- */

export const PROJECTS: DemoProject[] = [
  {
    key: "proj-lumen",
    name: "AI Productivity Platform",
    description:
      "Lumen: an AI-powered second brain that captures notes, retrieves context, " +
      "and proactively suggests decisions with contradiction detection.",
    status: "active",
    progress: 0.65,
    milestones: [
      "Jan — concept and prototype",
      "Feb — requirements and architecture",
      "Mar — invite-only beta launch",
      "Apr — strategy revision toward team features",
      "May — 150 active beta users",
    ],
    decisions: ["sem-d-01", "sem-d-02", "sem-d-03", "sem-d-10"],
    goals: ["sem-g-01", "sem-g-03", "sem-g-08"],
    risks: ["Retrieval precision can erode trust if suggestions feel wrong."],
  },
  {
    key: "proj-saas",
    name: "SaaS Business Launch",
    description:
      "Cloudline is preparing to launch Rivet, a separate analytics SaaS product, " +
      "after Lumen matures.",
    status: "planned",
    progress: 0.2,
    milestones: ["Q2 — customer discovery", "Q3 — MVP scoping"],
    decisions: ["sem-d-05"],
    goals: ["sem-g-04"],
    risks: ["Split focus between two ventures."],
  },
  {
    key: "proj-learn",
    name: "Personal Learning System",
    description:
      "A decentralized system using spaced repetition to retain research and design " +
      "knowledge.",
    status: "active",
    progress: 0.55,
    milestones: ["Feb — adopt spaced repetition", "Mar — daily writing habit"],
    decisions: ["sem-d-06"],
    goals: ["sem-g-06"],
  },
  {
    key: "proj-research",
    name: "Technology Research",
    description:
      "A structured survey of AI memory and retrieval, in collaboration with " +
      "BrightPath Labs.",
    status: "active",
    progress: 0.6,
    milestones: ["Feb — interview Dr. Elena", "Mar — draft findings"],
    decisions: ["sem-d-02"],
    goals: ["sem-g-05"],
  },
];

/* ---------------------------------------------------------------------------
 * DOCUMENTS (8)
 * ------------------------------------------------------------------------- */

export const DOCUMENTS: DemoDocument[] = [
  {
    key: "doc-strategy",
    title: "Lumen Product Strategy v2",
    kind: "strategy",
    content:
      "Position Lumen as a trust-first second brain for knowledge workers. Q2 " +
      "focus shifts to team features per the April revision, with mobile " +
      "reprioritized after strong demand signals.",
  },
  {
    key: "doc-research",
    title: "AI Memory & Retrieval Research Notes",
    kind: "research",
    content:
      "Notes from BrightPath collaboration: hybrid retrieval outperforms pure " +
      "embedding search; temporal signals improve recall on dated decisions.",
  },
  {
    key: "doc-minutes",
    title: "Roadmap Prioritization — Meeting Minutes",
    kind: "minutes",
    content:
      "Agreed to schedule mobile work after web stabilization; flagged the free-tier " +
      "question for a later pricing review.",
  },
  {
    key: "doc-requirements",
    title: "Lumen Requirements — MVP",
    kind: "requirements",
    content:
      "MVP scope: capture bullet notes, hybrid retrieval, inline suggestions, and " +
      "decision-log integration. Out of scope for MVP: native mobile, team admin.",
  },
  {
    key: "doc-arch",
    title: "Technical Architecture Notes",
    kind: "architecture",
    content:
      "Next.js web client backed by Supabase (Postgres, auth, edge). Embedding " +
      "models produce vectors for hybrid retrieval. All dates stored in UTC.",
  },
  {
    key: "doc-business",
    title: "Cloudline Business Plan",
    kind: "plan",
    content:
      "Cloudline ships Rivet as a separate analytics SaaS. Targets $5k MRR by " +
      "year-end with a free tier to seed adoption before paid conversion.",
  },
  {
    key: "doc-learning",
    title: "Personal Learning System Notes",
    kind: "learning",
    content:
      "Weekly spaced-repetition reviews applied to research notes. Daily writing " +
      "habit strengthens retention and clarifies ideas.",
  },
  {
    key: "doc-decision-log",
    title: "Decision Log — Lumen",
    kind: "log",
    content:
      "Stack decision Jan, hybrid retrieval Feb, beta launch Mar, strategy revision " +
      "Apr, mobile reversal May, free-tier policy shift noted for September.",
  },
];

/* ---------------------------------------------------------------------------
 * CONVERSATIONS (12) — each demonstrates a named capability
 * ------------------------------------------------------------------------- */

export const CONVERSATIONS: DemoConversation[] = [
  {
    key: "cv-recall-decision",
    title: "Recall a decision",
    questions: ["Which stack did I choose for Lumen, and why?"],
    answer:
      "In January I decided to build Lumen on Supabase with Next.js to keep ops " +
      "light and move fast. Sam and I confirmed the approach in our kickoff.",
    evidenceKeys: ["sem-d-01", "sem-c-03", "asso-a-26", "epi-e-02"],
  },
  {
    key: "cv-preferences",
    title: "Preferences",
    questions: ["What are my working preferences?"],
    answer:
      "You prefer asynchronous written communication, morning deep-work blocks, " +
      "early shipping, and open-source tooling. You also dogfood Lumen daily.",
    evidenceKeys: ["sem-p-01", "sem-p-03", "sem-p-06", "sem-p-09"],
  },
  {
    key: "cv-project-context",
    title: "Project context",
    questions: ["Where does the AI Productivity Platform stand right now?"],
    answer:
      "Lumen launched an invite-only beta in March and hit 150 active users by " +
      "mid-May. The Q2 focus is team features, with a 200-user June target.",
    evidenceKeys: ["sem-c-05", "sem-g-01", "epi-e-04", "epi-e-29", "sem-d-10"],
  },
  {
    key: "cv-temporal",
    title: "Temporal reasoning",
    questions: [
      "When did the beta happen relative to the mobile decision?",
      "Which came first?",
    ],
    answer:
      "The beta launched in March. The initial decision to postpone mobile came in " +
      "February, and it was reversed in May after usage data showed strong demand.",
    evidenceKeys: ["epi-e-04", "sem-d-04", "sem-d-17", "epi-e-12"],
  },
  {
    key: "cv-contradiction",
    title: "Contradiction",
    questions: ["Did I change my mind about the mobile app?"],
    answer:
      "Yes — you first decided to postpone mobile until after web validation in " +
      "February, then reversed that in May in favor of reprioritizing mobile.",
    evidenceKeys: ["sem-d-04", "sem-d-17", "sem-c-18"],
  },
  {
    key: "cv-connected-knowledge",
    title: "Connected knowledge",
    questions: ["How does Lumen relate to my broader second-brain approach?"],
    answer:
      "Lumen is the productized realization of your second-brain concept — capture, " +
      "retrieve, suggest — and your daily plain-text notes feed it directly.",
    evidenceKeys: ["asso-a-01", "sem-c-16", "sem-p-05", "asso-a-31"],
  },
  {
    key: "cv-goals-progress",
    title: "Goals & progress",
    questions: ["Am I on track to hit 200 beta users by June?"],
    answer:
      "You're pacing ahead: 150 active users by mid-May against a 200-user June " +
      "target. Weekly retrieval reviews keep suggestion quality stable.",
    evidenceKeys: ["sem-g-01", "epi-e-29", "sem-c-11"],
  },
  {
    key: "cv-procedural",
    title: "Procedural",
    questions: ["How do I run my weekly consolidation?"],
    answer:
      "Weekly you review new memories, merge duplicates, and write one " +
      "consolidation summary per theme, then recalibrate confidence thresholds.",
    evidenceKeys: ["proc-pr-03", "proc-pr-25", "epi-e-23"],
  },
  {
    key: "cv-research-recall",
    title: "Research recall",
    questions: ["What were the key findings from my AI research survey?"],
    answer:
      "The survey, informed by Dr. Elena at BrightPath, found hybrid retrieval " +
      "outperforms pure embedding search and temporal signals improve recall.",
    evidenceKeys: ["sem-g-05", "epi-e-17", "sem-c-13", "sem-c-06"],
  },
  {
    key: "cv-decision-support",
    title: "Decision support",
    questions: ["Should I keep the free tier?"],
    answer:
      "You originally decided to keep a free tier for solo users. However, a " +
      "September move to paid-only is now recorded — these two decisions conflict, " +
      "so they need a review before then.",
    evidenceKeys: ["sem-d-11", "sem-d-18", "epi-e-33", "sem-c-17"],
  },
  {
    key: "cv-cross-project",
    title: "Cross-project",
    questions: ["What context from my SaaS launch matters for Lumen's roadmap?"],
    answer:
      "Even though Rivet/Cloudline is a separate venture, the March strategy work " +
      "reuses Lumen's design system and reinforces the focus on team features.",
    evidenceKeys: ["sem-c-09", "asso-a-05", "sem-d-10", "sem-g-04"],
  },
  {
    key: "cv-comprehensive",
    title: "Comprehensive context",
    questions: ["Give me a comprehensive overview of where things stand."],
    answer:
      "Alex leads Northstar Studio and Lumen with Sam. Lumen is in active beta, " +
      "the Q2 strategy centers on team features, mobile was reprioritized, and " +
      "Cloudline's Rivet remains in pre-launch planning with a $5k MRR goal.",
    evidenceKeys: [
      "sem-c-01",
      "sem-c-03",
      "sem-c-19",
      "sem-g-04",
      "sem-d-08",
      "epi-e-08",
    ],
  },
];

/* ---------------------------------------------------------------------------
 * CONSOLIDATIONS (6)
 * ------------------------------------------------------------------------- */

export const CONSOLIDATIONS: DemoConsolidation[] = [
  {
    title: "Mobile strategy saga",
    kind: "insight",
    summary:
      "A February decision to postpone mobile was reversed in May after usage " +
      "data showed strong demand.",
    memoryKeys: ["sem-d-04", "sem-d-17", "epi-e-12", "sem-c-18"],
    confidence: 0.85,
  },
  {
    title: "Go-to-market thesis",
    kind: "theme",
    summary:
      "Launch invite-only, keep a free tier, and prioritize team features to " +
      "accelerate adoption before monetizing.",
    memoryKeys: ["sem-d-03", "sem-d-11", "sem-d-18", "epi-e-33", "sem-g-01"],
    confidence: 0.8,
  },
  {
    title: "Partner model",
    kind: "insight",
    summary:
      "Sam owns engineering while Alex leads product/design; weekly Friday syncs " +
      "anchor alignment.",
    memoryKeys: ["sem-d-08", "sem-c-03", "sem-c-15"],
    confidence: 0.9,
  },
  {
    title: "Retrieval quality bar",
    kind: "theme",
    summary:
      "Weekly precision review plus an open-source eval toolkit keep retrieval " +
      "honest as features change.",
    memoryKeys: ["sem-c-11", "sem-c-17", "epi-e-19", "sem-d-16"],
    confidence: 0.75,
  },
  {
    title: "Learning system recap",
    kind: "theme",
    summary:
      "Spaced repetition plus a daily writing habit improved retention of research " +
      "and design notes.",
    memoryKeys: ["sem-d-06", "sem-g-06", "proc-pr-19", "epi-e-25"],
    confidence: 0.8,
  },
  {
    title: "Roadmap rationalization",
    kind: "insight",
    summary:
      "Scope growth toward team features pushed the stable v1.0 to Q4 for " +
      "quality's sake.",
    memoryKeys: ["sem-d-10", "sem-g-03", "sem-d-21", "epi-e-28"],
    confidence: 0.82,
  },
];

/* ---------------------------------------------------------------------------
 * PATTERNS (5)
 * ------------------------------------------------------------------------- */

export const PATTERNS: DemoPattern[] = [
  {
    patternType: "careful-then-abap",
    description:
      "Start with a simple fallback and upgrade only after usage proves the need; " +
      "matches the phased AI feature rollout.",
    memoryKeys: ["sem-p-06", "sem-d-13", "proc-pr-20"],
  },
  {
    patternType: "conflict-driven-trust",
    description:
      "Proactively surfacing contradictions builds user trust in retrieval quality.",
    memoryKeys: ["sem-c-10", "asso-a-18", "sem-c-17"],
  },
  {
    patternType: "dogfood-loop",
    description:
      "Using the product daily converts personal friction into a continuous source " +
      "of product feedback.",
    memoryKeys: ["sem-p-09", "asso-a-20", "proc-pr-02"],
  },
  {
    patternType: "notional-bridge",
    description:
      "Linking concepts across projects adds disproportionate value for teams.",
    memoryKeys: ["sem-c-19", "asso-a-16", "sem-c-16"],
  },
  {
    patternType: "review-cadence",
    description:
      "Frequent lightweight reviews beat occasional deep audits for keeping data " +
      "clean.",
    memoryKeys: ["sem-c-11", "proc-pr-03", "sem-c-17"],
  },
];

/* ---------------------------------------------------------------------------
 * CONTRADICTIONS (4) — genuine conflicts between recorded memories
 * ------------------------------------------------------------------------- */

export const CONTRADICTIONS: DemoContradiction[] = [
  {
    memoryKeyA: "sem-d-04",
    memoryKeyB: "sem-d-17",
    category: "decision_reversal",
    evidence:
      "Early decision to postpone mobile was reversed in May after usage data " +
      "showed strong mobile demand.",
  },
  {
    memoryKeyA: "sem-d-11",
    memoryKeyB: "sem-d-18",
    category: "pricing_policy",
    evidence:
      "Spring decision to keep a free tier conflicts with the September plan to go " +
      "paid-only.",
  },
  {
    memoryKeyA: "sem-d-19",
    memoryKeyB: "sem-d-20",
    category: "infrastructure",
    evidence:
      "Managing Supabase is the committed approach, but self-hosting is now under " +
      "consideration to cut cost.",
  },
  {
    memoryKeyA: "sem-g-03",
    memoryKeyB: "sem-d-21",
    category: "schedule",
    evidence:
      "The Q3 v1.0 goal conflicts with the decision to push the stable release to " +
      "Q4 after scope expansion.",
  },
];

/* ---------------------------------------------------------------------------
 * SUGGESTIONS (5)
 * ------------------------------------------------------------------------- */

export const SUGGESTIONS: DemoSuggestion[] = [
  {
    suggestionType: "recall",
    title: "Revisit the mobile decision",
    body:
      "Your earlier 'postpone mobile' note was superseded in May; check the latest " +
      "resolution before planning.",
    targetKey: "sem-d-17",
  },
  {
    suggestionType: "gap",
    title: "Resolve the free-tier conflict",
    body:
      "Two pricing decisions conflict. Review them before the September change " +
      "takes effect.",
    targetKey: "sem-d-18",
  },
  {
    suggestionType: "link",
    title: "Connect research to retrieval work",
    body:
      "The AI research survey findings directly inform Lumen's retrieval quality " +
      "work.",
    targetKey: "sem-g-05",
  },
  {
    suggestionType: "action",
    title: "Book the first case-study interview",
    body:
      "Your goal requires ten interviews by July; schedule the first one now.",
    targetKey: "sem-g-09",
  },
  {
    suggestionType: "review",
    title: "Run weekly consolidation",
    body:
      "No consolidation was logged this week. Follow the standard weekly workflow.",
    targetKey: "proc-pr-03",
  },
];

/* ---------------------------------------------------------------------------
 * AGENTS (1)
 * ------------------------------------------------------------------------- */

export const AGENTS: DemoAgent[] = [
  {
    name: "Laurel",
    description:
      "Laurel is the MNEMOSYNE demo agent that answers questions by composing " +
      "evidence-backed responses from the sample universe.",
    category: "demo",
    scopes: [
      "recall",
      "decision-support",
      "temporal",
      "contradiction",
      "procedural",
      "cross-project",
    ],
  },
];
