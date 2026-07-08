# PRD: Vector-Graph Database Schema

## Purpose

Private, maintainer-only store for monitoring pipeline quality — not a public
sample library. Every capture, its derived stems, its tags, and every piece of
HITL feedback about it should be traceable back to this record.

## Core entities

### Sample (raw capture)
- `id`
- `source_platform`, `source_url`, `uploader_type_signal`, `upload_date`
- `capture_timestamp`
- `audio_fingerprint` (Chromaprint output, stored regardless of copyright
  outcome for internal dedup/monitoring — blocked captures should still be
  logged for audit purposes, just not made available for download)
- `copyright_status`: `cleared_tier1` | `cleared_tier2` | `cleared_tier3` |
  `cleared_tier4` | `blocked`
- `copyright_tier4_rationale` (nullable, private audit field only)
- `raw_file_ref` (storage pointer, not embedded)
- `vector_embedding` (audio embedding for similarity search — powers usage-match)

### Tags (1:1 with sample, algorithmic layer)
- `bpm`, `bpm_confidence`
- `key`, `key_confidence`
- `type` (one-shot | loop)
- `category` (vocal | drum | pad | fx | kick | snare | etc.)
- `disambiguation_triggered` (bool), `disambiguation_agent_output` (nullable)

### DisplayName (1:1 with sample, LLM-generated layer)
- `generated_name`
- `producer_edited_name` (nullable)
- `producer_comment` (nullable free text)
- logged as its own entity, not overwritten, so the (detected -> proposed ->
  corrected) tuple survives for the aggregate pattern agent to mine later

### Stem (child of Sample, one row per extracted stem)
- `parent_sample_id`
- `stem_type` (vocals | drums | bass | other)
- `separation_model_used`
- `dsp_quality_score`
- `file_ref`

### HITLEvent (append-only log, any touchpoint)
- `sample_id`
- `touchpoint`: `quality_rating` | `naming_feedback` | `usage_match_flag`
- `payload` (touchpoint-specific JSON)
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
