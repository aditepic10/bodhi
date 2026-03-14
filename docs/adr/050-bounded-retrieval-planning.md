# ADR-050: Bounded Retrieval Planning

## Status
Accepted

## Context
Bodhi recall cannot scale by dumping large amounts of raw memory into model context, and it cannot rely on a model "remembering" to search storage before answering. As capture sources and stored memories grow, recall needs a bounded, deterministic retrieval step that can evolve from SQLite FTS into richer retrieval backends without rewriting the agent loop.

## Decision
Introduce a retrieval planning layer between user questions and model generation:
- translate the question into a bounded retrieval plan
- retrieve only a small working set of relevant facts and events
- inject retrieved evidence into the prompt before answer generation
- keep retrieval backends swappable behind a stable service boundary

The agent may still have a retrieval tool for follow-up search, but first-pass recall must not depend on the model deciding to call it.

## Consequences
Recall becomes more reliable and scales better with more capture sources and more data. The architecture gains a new service boundary and some planner logic, but avoids both prompt stuffing and brittle one-off hard-coding inside the agent loop.

## Ground Truth
Anthropic search-result guidance, OpenAI retrieval tooling guidance, and modern memory systems such as Mem0 all rely on bounded retrieval rather than full-context loading.
