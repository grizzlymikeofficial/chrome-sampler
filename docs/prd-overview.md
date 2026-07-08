# PRD: Browser Sample Capture & Analysis Extension — Overview

## What this is

A Chrome extension that captures audio playing in the browser (YouTube, TikTok,
Instagram, radio-streaming sites, and generic `<audio>`/`<video>` sources),
runs it through an automated analysis pipeline, and gives producers a clean,
free sample/stem to download. A private backend database logs every capture
for the maintainer's own analysis of pipeline quality — it is **not** a public
sample marketplace.

## Who it's for

Producers who want free samples and stems, pulled from audio they don't have
studio files for, who will heavily process/layer what they download. Cost per
user must trend toward zero — this shapes every architecture decision below.

## Non-negotiable constraints

1. **Copyright check is blocking in production.** No admin toggle to
   "notify only" in the shipped product. A sample that fails the check is not
   captured, full stop.
2. **The sample database is private**, used only for the maintainer's
   monitoring of AI pipeline quality — not a public library.
3. **Runtime cost must stay near-free.** Prefer deterministic/classical
   algorithms everywhere they work as well as or better than an LLM. LLM calls
   are reserved for tasks that are genuinely about language/context reasoning,
   not audio perception. See `prd-backend-pipeline.md` for the specific
   cascade design.

## System shape

```
Chrome extension (client)
        |
        v
Recognition service (non-agentic, site adapters)
        |
        v
Copyright cascade (fingerprint -> landmark match -> commercial API -> LLM escalation)
        |
        v
Tagging engine (algorithmic) + disambiguation/naming agent (LLM, <70% confidence)
        |
        v
Stem extraction (multi-algorithm + DSP-based scorer, no LLM)
        |
        v
Vector-graph database (private)
        |
        v
HITL surfaces (quality rating, naming feedback, usage-match flag)
        |
        v
Aggregate pattern agent -> STATUS.md / architecture-notes.md -> dev agents
```

## Document map

| File | Covers |
|---|---|
| `prd-extension-client.md` | Chrome extension UI, capture flow, site adapters |
| `prd-backend-pipeline.md` | Recognition, copyright cascade, tagging, stem extraction |
| `prd-database-schema.md` | Vector-graph DB schema, what's logged and why |
| `prd-hitl-review.md` | All five HITL/feedback loops, UI copy, logging format |
| `agents/architect.md` | Dev agent role: breaks PRDs into tasks, owns interfaces |
| `agents/implementer.md` | Dev agent role: writes code against architect's spec |
| `agents/reviewer.md` | Dev agent role: QA, tests, flags regressions |
| `status-log-protocol.md` | STATUS.md format and rules for cross-session agent memory |

## Open decisions to make before agents start writing code

- [x] **Vector-graph DB — started with Qdrant, not yet finalized.** The
      current schema's only relationship (Sample -> Stem) is one level deep
      and doesn't need real graph traversal, so we're prototyping against
      Qdrant alone (see `infra/docker-compose.yml`), modeling the Sample ->
      Stem edge as a `parent_sample_id` payload field rather than a true
      graph edge. **This is a starting point to get local dev moving, not a
      final architecture decision.** Revisit if/when multi-hop graph queries
      become genuinely necessary (e.g. cross-referencing samples derived
      from the same original source) — at that point, Neo4j with a vector
      index is the likely alternative. Agents should not treat this as
      settled; flag it again in a task spec if a feature you're building
      would benefit from real graph traversal.
- [ ] Commercial fingerprinting API vendor for Tier 3 (budget-dependent)
- [ ] Which LLM model/tier to call for Tier 4 copyright and tagging disambiguation (cost vs. reasoning quality tradeoff)
- [ ] Legal review of capture behavior against target platforms' ToS — flagged in earlier discussion, not resolved here
