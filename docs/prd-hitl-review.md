# PRD: Human-in-the-Loop Touchpoints & Feedback Loop

## Design principle

LLMs are used here for reasoning over language/ambiguity, never for audio
perception. Every touchpoint below should be checked against: "is this a
judgment call about context, or am I just asking an LLM to do what a
classifier already did better and cheaper?"

---

## Touchpoint 1 — Copyright Tier 4 escalation (not user-facing)

- Triggers only when Tiers 1-3 find no match and metadata is ambiguous.
- Output is a block/allow decision plus a rationale string.
- Rationale is written to `copyright_tier4_rationale` (private, see
  `prd-database-schema.md`) — never surfaced to the producer. In production,
  a block simply presents as "not available."
- Purpose of logging the rationale: lets the maintainer periodically audit
  for false blocks/false allows and refine the Tier 4 rubric.

## Touchpoint 2 — Tagging disambiguation (user-facing, low friction)

- Triggers when the algorithmic tagger's confidence is below 70% (e.g.
  competing BPM candidates in a ratio consistent with a polyrhythmic feel, or
  a key signature that doesn't cleanly fit Western 12-tone profiles).
- The LLM is given the algorithm's structured output (candidate values +
  confidence split), not raw audio, and asked to phrase a single inline
  question.
- UI: one tap/short answer, written straight to the sample's tag fields.
  Example: *"Sounds like 3/4 at 144 or half-time at 96 — which fits?"*
- Logged to `tags.disambiguation_agent_output` and the producer's answer,
  for later review of whether the framing is actually helping.

## Touchpoint 3 — Metadata enrichment / naming (user-facing)

- Runs on every tagged sample, not just low-confidence ones.
- LLM takes structured tags and proposes a human-searchable display name.
- Structured tags remain the source of truth for filtering; the generated
  name is a display/search-alias layer.
- Shown inline as an editable field at the point the producer views the
  sample.

## Touchpoint 4 — Naming feedback, bespoke and logged (the core learning loop)

This is the highest-value touchpoint for long-term system improvement —
treat it as a first-class data pipeline, not a side effect of touchpoint 3.

When a producer edits the generated name or leaves a comment, log the full
tuple, not just the final value:

```json
{
  "sample_id": "...",
  "algorithmic_tags": { "category": "fx", "bpm": 128, "key": "Cmin" },
  "llm_proposed_name": "descending fx sweep",
  "producer_final_name": "riser",
  "producer_comment": "this is a riser, not a sweep — sweeps go down",
  "timestamp": "..."
}
```

This (detected -> proposed -> corrected) tuple is what the aggregate pattern
agent mines to find systemic mismatches (e.g. "the model keeps calling
reversed-cymbal swells 'FX' when producers consistently rename them 'riser'")
and turn them into a proposed taxonomy or prompt fix — written to
`architecture-notes.md` for the dev agents to pick up. This is the mechanism
that closes the gap between "raw recording" and "searchable sample a producer
would actually type into a search bar."

## Touchpoint 5 — Usage-match flag (user-facing, informational)

- Uses the sample's vector embedding to search for similarity against other
  samples already in the database (and, longer-term, against known catalog
  fingerprints if that data becomes available).
- Presented as an informational flag, not a block — this is a "heads up,
  this resembles something else" signal for the producer's own awareness,
  not a copyright determination (that's Tier 4's job, and only Tier 4 blocks).

---

## The feedback loop (touchpoints -> dev agents)

```
Production pipeline output
        |
        v
Quality rating / Naming feedback / Usage-match flag  (touchpoints 1,3,5 style logging)
        |
        v
Aggregate pattern agent (periodic, not per-file)
        |
        v
STATUS.md / architecture-notes.md
        |
        v
Dev agents (architect + implementer)
        |
        (updates prompts, tags, code)
        v
        [ships back into production pipeline above]
```

The aggregate pattern agent's job, concretely, each run:
1. Read new HITLEvent rows and naming-feedback tuples since its last run
2. Read recent STATUS.md entries for any related dev-side context (e.g. a
   recent Tier 3 API change that might explain a spike in Tier 4 volume)
3. Write a dated entry to `architecture-notes.md`: what pattern it found,
   how many instances, a suggested fix (prompt edit, taxonomy edit, code
   change), and its confidence in that suggestion
4. Never auto-apply changes — always a proposal for a dev agent or human to
   act on next session
