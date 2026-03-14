# Retrieval V2 Blueprint

This document is the implementation blueprint for Bodhi's next retrieval pass. The goal is to keep the current typed activity substrate and replace the current simplistic planner/ranker with a bounded, explainable, scalable retrieval system.

The design follows the common pattern used by mature search systems:

1. retrieve a bounded candidate set
2. rerank candidates with explicit features
3. keep the result explainable and fast

It is not a plan to bolt on a hosted search engine or opaque magic.

## Goal

Improve broad and mixed-source recall quality while preserving:

- SQLite-first local performance
- typed structural filtering
- bounded retrieval cost
- privacy-safe defaults
- easy extension as new capture sources land

The practical result should be:

- broad questions like `what have i been up to?` return the right recent seams
- intent-heavy questions like `what AI help did I ask for?` surface AI prompts and tool calls first
- shell, Git, AI, notes, and future sources compete fairly instead of drowning each other out
- adding a new capture source does not require planner hacks

This phase is the workflow-retrieval layer, not the final product ceiling. Its job is to make recent, structured, source-rich activity reliably retrievable. Broader pattern detection, long-horizon memory synthesis, and semantic document-style retrieval can and likely should be added later on top of this layer.

## Current Weaknesses

Today the retrieval layer does this:

- tokenizes the question
- derives facets from a small hard-coded keyword table
- gives text search matches a fixed score
- gives typed recent-event matches a lower fixed score
- sorts by score, then recency

That is acceptable for the current foundation stage, but it is not the long-term retrieval architecture.

Weak points:

- broad queries are under-specified
- ranking is too coarse
- event families are not compared by reusable features
- planner logic is too close to source-specific keyword buckets
- richer sources can be ingested correctly but still rank poorly

## Architectural Position

The current typed storage model remains the right substrate:

- `events` as the append-only envelope
- `event_contexts` as shared work graph position
- typed child tables as source-specific truth
- FTS projection in `search_text`

Retrieval V2 builds on this model. It does not replace it.

This is important:

- data representation should remain stable as sources grow
- retrieval policy should evolve independently on top of that data

This means the near-term architecture should be layered:

1. typed activity substrate
2. workflow retrieval and recall
3. derived memory and insight generation
4. broader semantic and hybrid retrieval when it earns its keep

## Principles

1. Candidate generation is cheap and bounded.
2. Reranking is explicit and testable.
3. Structural filters beat string heuristics whenever possible.
4. Event families compete via shared ranking features, not one-off source hacks.
5. FTS is candidate recall, not the source of truth.
6. Adding a new source should mostly require defining its payload, context, `search_text`, and salience.

## Industry Pattern To Adopt

Across SQLite FTS5, Lucene/Tantivy, Typesense, Meilisearch, OpenSearch, and Vespa, the consistent pattern is:

- lexical candidate retrieval
- metadata filtering
- bounded top-N candidate pool
- explicit recency and metadata reranking
- optional second-phase ranking

The Bodhi implementation should reuse that pattern directly:

- FTS5 BM25 / rank for text relevance
- typed filters for repo/branch/cwd/tool/thread/time
- small feature-based reranker in app code
- no separate search service dependency

## Retrieval Pipeline

### Stage 1: Intent planning

Convert a user question into one or more retrieval intents.

Initial intent set:

- `recent_activity`
- `ai_help`
- `git_history`
- `debugging`
- `notes_facts`
- `resume_branch`

Intent planning must not be event-source-specific. It should be query-shape-specific.

Examples:

- `what have i been up to?` -> `recent_activity`
- `what AI help did I ask for?` -> `ai_help`
- `what happened on auth branch?` -> `git_history` + `resume_branch`
- `how was I debugging login?` -> `debugging`

The planner may still use explicit heuristics, but they should map to intents, not directly to event types.

### Stage 2: Candidate generation

Build a bounded candidate set from a few cheap paths:

- FTS5 search over `events_fts`
- recent typed events from `events`
- optional fact search
- structural filters from context and time windows

Each candidate should carry:

- the event or fact itself
- raw text relevance score when available
- retrieval path metadata

Candidate pool size should stay small and predictable:

- top 20 to 50 events
- top 10 to 20 facts

### Stage 3: Feature extraction

Every candidate should be scored with shared features.

Initial event features:

- `fts_score`
- `recency_score`
- `same_repo`
- `same_branch`
- `same_path`
- `same_tool`
- `same_thread`
- `event_family_weight`
- `outcome_weight`
- `intent_match`
- `exact_term_overlap`

Initial fact features:

- `fact_text_score`
- `fact_confidence`
- `fact_freshness`
- `intent_match`

### Stage 4: Reranking

Compute a weighted score from the features.

High-level rule:

- text relevance gets the event into the candidate pool
- recency and intent determine whether it wins
- structural matches boost confidence
- event family salience breaks ties intelligently

Example family weights:

- `git.commit.created`: high
- `git.rewrite`: high
- `ai.prompt`: medium-high
- `ai.tool_call`: medium-high
- `shell.command.executed`: medium
- `shell.command.started`: low
- `note.created`: medium

Example outcome weights:

- authoritative result event > shell intent event
- `git.merge` > shell `git merge ...`
- `ai.tool_call` > shell command that manually simulated a tool call

### Stage 5: Prompt rendering

Only the final reranked set goes into the agent context.

This keeps:

- prompt size bounded
- evidence quality high
- source noise low

## Data Model Sanity Check

The current typed model is sufficient for Retrieval V2.

We should keep it if these conditions remain true:

- every new capture source can populate shared context fields where meaningful
- every payload family can derive useful `search_text`
- every payload family can expose a reasonable `event_family_weight`

We should revisit the model only if a new capture source cannot fit those constraints without awkward duplication or query inefficiency.

For broader future product value, this model should continue to serve as the base layer for:

- derived facts
- summaries
- recurring-pattern detection
- open-loop tracking
- later semantic retrieval over richer note or document corpora

The model should not be bent toward those future layers prematurely, but it should remain compatible with them.

## How New Capture Sources Plug In

A new source should not require planner surgery.

The source integration contract is:

1. define the typed payload family
2. populate shared `ActivityContext` fields when possible
3. define `deriveSearchText()`
4. assign an event family / salience profile
5. add workflow tests

That is enough for Retrieval V2 to ingest it.

Planner changes should be needed only if the new source enables a new user intent, not because the source exists.

Examples:

### IDE capture

Should add:

- typed payload
- path/repo/tool/thread context
- search text
- family salience

Should not add:

- a dedicated IDE retrieval engine

### Browser or ticket capture

Same rule:

- shared context where meaningful
- typed payload
- search text
- family weight

No source-specific retrieval branch unless it introduces a new durable intent.

## Non-Goals

- embeddings or vector search in this pass
- external search engine dependency
- opaque ML ranking model
- unlimited candidate pools
- retrieval that depends on transcript dumps

These are deferred, not rejected forever. The point of this pass is to establish a strong, typed, workflow-aware retrieval layer first.

## Implementation Worklist

### Planner

- [packages/daemon/src/retrieval/planner.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/retrieval/planner.ts)
  - replace keyword facet table with intent planning
  - keep time-window and structural filter derivation

### Service

- [packages/daemon/src/retrieval/service.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/retrieval/service.ts)
  - retrieve bounded candidate pools
  - attach ranking features
  - rerank with explicit scoring

### Query path

- [packages/daemon/src/query/fts.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/query/fts.ts)
  - expose FTS rank / BM25 candidate ordering cleanly

### Prompt rendering

- [packages/daemon/src/agent/system-prompt.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/agent/system-prompt.ts)
  - render reranked mixed-source evidence cleanly

### Shared types

- [packages/daemon/src/retrieval/types.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/retrieval/types.ts)
  - add retrieval intent and candidate feature types

## Test-First Plan

### 1. Intent planning tests

Prove broad and specific queries map to the right intents:

- `what have i been up to?`
- `what AI help did I ask for?`
- `what happened on auth branch?`
- `how was I debugging login?`

### 2. Candidate generation tests

Prove bounded candidate pools include relevant mixed-source evidence:

- shell + Git + AI
- repo filter
- branch filter
- path filter
- thread/tool filter

### 3. Ranking tests

Prove the reranker prefers the right evidence:

- recent AI prompt beats older unrelated Git event for AI-help questions
- `git.commit.created` beats shell `git commit ...`
- `ai.tool_call` beats shell test harness noise
- recent mixed activity beats older dense activity for broad queries

### 4. Worst-case tests

Mandatory:

- very broad query
- empty lexical overlap but same repo/branch intent
- many same-day events from multiple sources
- detached `HEAD`
- worktree activity
- duplicate shell and authoritative event pairs
- note/fact noise near more relevant AI/Git evidence

## Completion Bar

Retrieval V2 is complete only when:

- broad recent-activity queries return useful mixed-source evidence
- AI-focused queries reliably surface recent `ai.prompt` / `ai.tool_call`
- Git-focused queries prefer authoritative Git events over shell intent
- ranking remains bounded and explainable
- adding a new capture source does not require source-specific planner hacks
- workflow tests demonstrate stable behavior across mixed shell/Git/AI timelines

Retrieval V2 is not responsible for:

- long-horizon pattern mining
- semantic document search
- cross-week insight generation

Those belong in later layers built on top of this one.

## References

- SQLite FTS5 BM25 and rank: https://www.sqlite.org/fts5.html
- Lucene BM25 similarity: https://lucene.apache.org/core/6_6_6/core/org/apache/lucene/search/similarities/BM25Similarity.html
- Tantivy fast fields: https://docs.rs/tantivy/latest/tantivy/fastfield/index.html
- Typesense ranking and relevance: https://typesense.org/docs/guide/ranking-and-relevance.html
- Meilisearch ranking rules: https://www.meilisearch.com/docs/learn/relevancy/ranking_rules
- Meilisearch custom ranking rules: https://www.meilisearch.com/docs/learn/relevancy/custom_ranking_rules
- OpenSearch function score and decay: https://docs.opensearch.org/latest/query-dsl/compound/function-score/
- Vespa ranking features: https://docs.vespa.ai/en/ranking/ranking-expressions-features.html
