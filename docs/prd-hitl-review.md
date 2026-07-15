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

- Triggers when any audio-ML tag field's confidence is below the LLM-as-judge
  threshold (0.7) — this now spans BPM, Key, Genre, and Mood, not just
  BPM/Key as originally scoped. Example triggers: competing BPM candidates in
  a ratio consistent with a polyrhythmic feel, a key signature that doesn't
  cleanly fit Western 12-tone profiles, or a Genre/Mood classifier split
  roughly evenly across two labels.
- The LLM-as-judge is given each field's structured output — concretely,
  `Tags.raw_model_outputs` for that field (`prd-database-schema.md`), the
  actual candidate values + confidences already computed, not raw audio —
  and asked to phrase a single inline question from them. Its job is
  judging/framing, never re-perceiving the audio itself
  (`prd-backend-pipeline.md` section 3). The prompt's options *are* those
  stored candidates (e.g. the two choices in the mood example below are
  CLAP's top-2 matches) — this data gets persisted now instead of computed
  and discarded after rendering the prompt.
- UI: one tap/short answer, written straight to the sample's tag fields.
  Examples: *"Sounds like 3/4 at 144 or half-time at 96 — which fits?"* /
  *"Leaning moody trap or dark ambient — which is closer?"*
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

## Touchpoint 6 — Tag correction & preference feedback loop (the tag-side counterpart to touchpoint 4)

Mirrors touchpoint 4's design exactly, for tags instead of names: whenever a
producer overrides any tag field — whether or not touchpoint 2 was triggered
for it — log the full tuple, not just the final value:

```json
{
  "sample_id": "...",
  "field": "mood",
  "ml_model_tag": "moody",
  "ml_model_confidence": 0.61,
  "llm_judge_decision": "route_to_producer",
  "producer_final_tag": "dark ambient",
  "producer_comment": "moody undersells how sparse this is",
  "timestamp": "..."
}
```

This is what the aggregate pattern agent mines to find systemic tagging
mismatches (e.g. "the Mood model keeps saying 'moody' for what producers
consistently correct to 'dark ambient'") and turn into a proposed
LLM-judge-prompt revision — written to `architecture-notes.md`, same as
touchpoint 4. **Resolved (see `prd-overview.md` and `prd-backend-pipeline.md`
section 3):** this proposal-mining loop is what "trains the system on
tag-preference" mechanically means — it can't mean model
fine-tuning/personalization, since every tagging model in the pipeline
(librosa, aubio, essentia, PANNs/YAMNet, musicnn, CLAP) is a static
pretrained artifact this project doesn't own or train. What actually
improves is the judge's own prompt.

## Touchpoint 7 — Stem extraction prompt & decision logging (user-facing + tuning data)

- Runs right after tagging completes (multi-label `categories` output is
  available — see `prd-backend-pipeline.md` section 3).
- If the multi-instrument flag fires (≥2 stem-relevant buckets — vocals/
  drums/bass/other — cross the section-4 threshold, currently a
  maintainer-flagged-as-tunable 0.5, not the 0.7 tagging threshold), show an
  inline suggestion: *"Multiple instruments detected — would you like to
  extract stems?"*
- **The "Extract Stems" button is always present regardless of the flag** —
  this is a deliberate change from an earlier version of this pipeline that
  gated the button behind the flag entirely. Extraction is now a producer
  judgment call the system can suggest but never withholds.
- Log every decision, not just the flagged-and-accepted case, so the
  threshold can actually be tuned later against real behavior instead of
  guessed at:

```json
{
  "sample_id": "...",
  "multi_instrument_flag": true,
  "detected_buckets": ["vocals", "drums"],
  "bucket_confidences": { "vocals": 0.9, "drums": 0.9, "bass": 0.1, "other": 0.2 },
  "producer_action": "accepted" ,
  "timestamp": "..."
}
```
  `producer_action` is one of `accepted` (flag fired, producer extracted),
  `declined` (flag fired, producer didn't), or `manual_unflagged` (flag
  didn't fire, producer extracted anyway). All three are equally useful
  signal: a lot of `declined` says the 0.5 threshold is too loose; a lot of
  `manual_unflagged` says it's too strict.
- This is exactly the data the maintainer plans to use for the "come back
  and fine-tune once it's working" pass on the 0.5/≥2-bucket defaults in
  `prd-backend-pipeline.md` section 4 — logging it from day one means that
  pass has real data to work from instead of starting cold.

---

## The feedback loop (touchpoints -> dev agents)

```
Production pipeline output
        |
        v
Quality rating / Naming feedback / Tag correction / Usage-match flag / Stem-extraction decision  (touchpoints 1,3,5,6,7 style logging)
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
1. Read new HITLEvent rows and naming-feedback / tag-correction tuples since
   its last run
2. Read recent STATUS.md entries for any related dev-side context (e.g. a
   recent Tier 3 API change that might explain a spike in Tier 4 volume)
3. Write a dated entry to `architecture-notes.md`: what pattern it found,
   how many instances, a suggested fix (prompt edit, taxonomy edit, code
   change), and its confidence in that suggestion
4. Never auto-apply changes — always a proposal for a dev agent or human to
   act on next session
