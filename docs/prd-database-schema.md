# PRD: Vector-Graph Database Schema

## Purpose

Private, maintainer-only store for monitoring pipeline quality — not a public
sample library. Every capture, its derived stems, its tags, and every piece of
HITL feedback about it should be traceable back to this record.

## Core entities

### Sample (raw capture)
- `id`
- `producer_id` — who captured this. Single hardcoded value for now
  (local/solo maintainer use, no auth system exists), but the field exists
  from the start specifically so today's data isn't structurally
  single-tenant once/if producer-aligned tag recommendations
  (`prd-backend-pipeline.md` section 3, "Longer-term direction") become
  real — retrofitting producer identity onto historical rows after the
  fact would mean today's corrections can never be attributed to anyone.
- `source_platform`, `source_url`, `uploader_type_signal`, `upload_date`
- `capture_timestamp`
- `capture_duration_seconds` — length of the actual captured/stored audio.
  Not previously tracked; needed to evaluate whether the duration-handling
  UX (`prd-extension-client.md`, alert past 60s / recommend under 10min) is
  actually changing capture behavior, not just to have it on hand.
- `audio_fingerprint` (Chromaprint output, stored regardless of copyright
  outcome for internal dedup/monitoring — blocked captures should still be
  logged for audit purposes, just not made available for download)
- `copyright_status`: `cleared_tier1` | `cleared_tier2` | `cleared_tier3` |
  `cleared_tier4` | `blocked`
- `copyright_check_enforced` (bool) — whether this capture actually went
  through the blocking Tier 1-4 decision, or was captured during a phase
  where the check was optional (see `prd-backend-pipeline.md` section 2's
  V0 note). Without this, `copyright_status` values from that period would
  be indistinguishable from real enforced decisions when auditing false-
  allow/false-block rates later — a V0-bypassed row and a real Tier-1-clear
  row would look identical without this flag.
- `copyright_tier4_rationale` (nullable, private audit field only)
- `raw_file_ref` (storage pointer, not embedded)
- `vector_embedding` (audio embedding for similarity search — powers usage-match)
- `embedding_model_version` (e.g. `"clap-htsat-unfused"` + release/commit) —
  **real gap, not optional:** without this, embeddings from different model
  versions end up mixed in the same similarity index with no way to tell
  them apart. If the embedding source ever changes, usage-match search
  degrades silently instead of visibly, since old and new embeddings aren't
  actually comparable.
- `pipeline_config_version` (nullable, lower priority than the above) — a
  single version tag for "which cascade config was active" (the 0.7
  LLM-judge threshold, the 0.5/≥2-bucket stem-extraction threshold, etc.),
  bumped whenever those get tuned. Lighter-weight than storing every
  individual threshold value per row, and gives the planned tuning passes
  (section 4's threshold, the LLM-judge prompt) a way to segment "before vs.
  after" without guessing from timestamps. Flagging as genuinely optional —
  cut it if it feels like more bookkeeping than a solo-maintainer prototype
  needs right now.

### Tags (1:1 with sample, audio-ML-generated layer)
- `bpm`, `bpm_confidence`
- `key`, `key_confidence`
- `type` (one-shot | loop)
- `categories` (array of `{ label, confidence }` — PANNs/YAMNet score every
  AudioSet class independently, not one top-1 pick; renamed from singular
  `category` since a capture can legitimately hit multiple labels at once,
  e.g. a loop with both a drum layer and a melodic layer — see
  `prd-backend-pipeline.md` section 3. The multi-instrument stem-extraction
  flag (section 4 there, touchpoint 7 in `prd-hitl-review.md`) is derived
  from this field, not a separate one.)
- `genre`, `genre_confidence` (`musicnn`, cross-checked against PANNs/YAMNet
  — see `prd-backend-pipeline.md` section 3)
- `mood`, `mood_confidence` (`CLAP` text-audio embedding match — see
  `prd-backend-pipeline.md` section 3)
- `disambiguation_triggered` (bool), `disambiguation_agent_output` (nullable)
  — LLM-as-judge output when any field above falls below the 0.7 confidence
  threshold (`prd-backend-pipeline.md` section 3); not BPM/Key-specific
  anymore now that Genre/Mood exist
- `multi_instrument_detected` (bool) — denormalized from the touchpoint 7
  stem-extraction flag (`prd-hitl-review.md`) for the same reason
  `disambiguation_triggered` lives here instead of only in `HITLEvent`:
  "show me all currently-flagged samples" shouldn't require scanning the
  event log every time.
- `model_versions` (JSON, e.g. `{ "bpm": "librosa-0.10.1+aubio-0.4.9",
  "key": "essentia-2.1-beta6", "categories": "panns-cnn14-...",
  "genre": "musicnn-...", "mood": "clap-htsat-unfused-...",
  "llm_judge": "<model+date>" }`) — **real gap, not optional:** without
  this, there's no way to fairly compare tagging accuracy before vs. after
  swapping any one model (e.g. upgrading the genre model, or changing which
  LLM does judging) — old rows would be indistinguishable from new ones.
  One JSON field instead of one column per model since several fields
  already involve more than one contributing tool (BPM's librosa+aubio
  cross-check, Genre's musicnn+PANNs/YAMNet cross-check).
- `raw_model_outputs` (JSON — **real gap, maintainer-identified:** every
  contributing model's candidate value + confidence per field, not just the
  arbitrated winner that ends up in `bpm`/`genre`/`mood` above):
  ```json
  {
    "bpm": [
      { "model": "librosa", "value": 120 },
      { "model": "aubio", "value": 120 }
    ],
    "genre": [
      { "model": "musicnn", "value": "trap", "confidence": 0.88 },
      { "model": "panns_yamnet", "value": "hip hop", "confidence": 0.71 }
    ],
    "mood": [
      { "model": "clap", "value": "dark ambient", "confidence": 0.62 },
      { "model": "clap", "value": "moody trap", "confidence": 0.55 }
    ]
  }
  ```
  `categories` doesn't need this treatment — it already stores every label
  above threshold, not just top-1 (that was the earlier multi-label fix).
  The gap is specifically the fields where a cross-check or embedding-match
  happens across candidates but only the merged/arbitrated value survives.
  This isn't purely an audit nicety layered on top of existing work: it's
  the **same data touchpoint 2's disambiguation prompt already needs** to
  build its options (e.g. "dark ambient" vs. "moody trap" as the two
  producer-facing choices *are* CLAP's top-2 candidates) — right now that
  data gets computed to render the prompt and then thrown away instead of
  persisted. Without it: (1) the arbitration/agreement logic that derives
  `bpm_confidence`/`genre_confidence` can't be debugged when it gets
  something wrong, since the raw inputs it disagreed or agreed on aren't
  recoverable; (2) no way to retrospectively compute each individual
  model's standalone accuracy against producer corrections — only the
  ensemble's accuracy is knowable from `bpm`/`genre`/`mood` alone; (3) if a
  future pass ever trains a lightweight model-selector/arbitrator (as
  opposed to the LLM-judge prompt-tuning already scoped), this is exactly
  the labeled data it would need and nothing else in the schema provides it.

### DisplayName (1:1 with sample, LLM-generated layer)
- `generated_name`
- `producer_edited_name` (nullable)
- `producer_comment` (nullable free text)
- logged as its own entity, not overwritten, so the (detected -> proposed ->
  corrected) tuple survives for the aggregate pattern agent to mine later

### Stem (child of Sample, one row per extracted stem)
- `parent_sample_id`
- `stem_type` (vocals | drums | bass | other)
- `separation_model_used` (which model: HTDemucs | Mel-Roformer | MDX-Net —
  `prd-backend-pipeline.md` section 4 picks per use case rather than always
  running all three)
- `separation_model_version` — same provenance gap as `Tags.model_versions`,
  called out separately here since it's its own entity: HTDemucs vs.
  Mel-Roformer vs. MDX-Net is already recorded via `separation_model_used`,
  but not which *version* of whichever one ran. Matters for the same
  reason — the DSP quality scorer (section 4) needs a stable baseline to
  detect drift against, and "which model" without "which version of it"
  isn't a stable baseline.
- `dsp_quality_score`
- `file_ref`

### HITLEvent (append-only log, any touchpoint)
- `sample_id`
- `producer_id` — who made this correction/rating. Deliberately separate
  from `Sample.producer_id`: the person correcting a tag won't always be
  the person who captured it once multi-producer use exists (e.g. a shared
  review queue), and conflating the two would lose that distinction later
  even though they're identical for every row today.
- `touchpoint`: `quality_rating` | `naming_feedback` | `tag_correction` |
  `usage_match_flag` | `stem_extraction_decision`
- `payload` (touchpoint-specific JSON — for `tag_correction`, the full
  ml-tag/LLM-judged-tag/producer-final-tag tuple, same pattern as
  `naming_feedback`'s tuple, see `prd-hitl-review.md` touchpoint 6; for
  `stem_extraction_decision`, the flag state + detected buckets + producer's
  accepted/declined/manual_unflagged action, see touchpoint 7 — this is the
  data source for tuning the section-4 multi-instrument threshold later)
- `timestamp`

## Why vector + graph, not just relational

- **Vector** side powers usage-match (touchpoint 5 in the HITL doc) — nearest-
  neighbor search over audio embeddings to flag "this sample resembles
  something already in the database" or, longer-term, resembles known
  commercial catalog fingerprints.
- **Graph** side models the Sample -> Stem parent/child relationship and any
  future relationships (e.g. samples derived from the same original source),
  which is a natural fit for graph traversal rather than repeated joins.

## Access model

- No public read access. Admin/maintainer dashboard only.
- HITLEvent and copyright audit fields are never exposed to the end user,
  even the producer who generated them — they're internal quality-monitoring
  data, not user-facing history.
