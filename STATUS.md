# STATUS.md — Dev Agent Session Log

Most recent 5 entries live here. Older entries move to
docs/status-archive/YYYY-MM.md. See docs/status-log-protocol.md for format.

Entries through Session 2026-07-08-03:00 (first task-001 breakdown through
the MVP end-to-end demo build) moved to `docs/status-archive/2026-07.md`.

---

## Session 2026-07-11 — PRD update (no branch — doc update)

**Scope:** Maintainer described the real-world producer workflow this
product replaces (Blackhole-style loopback routing / extraction tools +
manual tagging) and the tagging pipeline's actual design history (tried
LLM-direct tagging, found deterministic vs. probabilistic split, landed on
audio-ML-tags + LLM-as-judge at a 0.7 confidence threshold + a tag-preference
feedback loop). Folded this into the PRDs before resuming build work, per
maintainer's explicit request to update docs first.

**Changed:**
- `prd-overview.md` — new "Status quo & why this exists" section; system-shape
  diagram updated to show audio-ML tagging + LLM-as-judge + tag-preference
  loop instead of the old "algorithmic + disambiguation/naming, <70%"
  phrasing; two new open decisions (Genre/Mood model names; what "tag-
  preference training" mechanically means); doc-map entry corrected from
  "five" to unspecified count now that there are 6 touchpoints.
- `prd-backend-pipeline.md` section 3 — retitled/rewritten: added the
  origin-story rationale, added Genre/Mood as audio-ML tag fields (model
  names flagged as placeholders, not fabricated), broadened the old
  "LLM disambiguation agent (BPM/Key, <70%)" into "LLM-as-judge" spanning
  all four probabilistic-capable fields at a 0.7 threshold, added a
  "Tag-preference feedback loop" paragraph pointing at the new open
  decision on what that mechanically means.
- `prd-database-schema.md` — `Tags` entity gets `genre`/`genre_confidence`,
  `mood`/`mood_confidence`; `HITLEvent.touchpoint` enum gets `tag_correction`.
- `prd-hitl-review.md` — Touchpoint 2 broadened from BPM/Key-only to all four
  fields; new **Touchpoint 6 — Tag correction & preference feedback loop**
  (mirrors touchpoint 4's tuple-logging pattern, for tags instead of names);
  feedback-loop diagram and the aggregate-pattern-agent's job description
  updated to include it.

**Broke / flaky:** N/A — docs only, no code touched this session.

**Dependency notes:** None of this changes anything already built
(task-001 adapters, capture engine, content script, stub backend) — the stub
backend's hardcoded response doesn't reference Genre/Mood at all yet, so
there's no drift to reconcile there. It will need updating whenever the real
tagging pipeline gets built, not before.

**Human feedback received:** Maintainer provided the full tagging-pipeline
design rationale (LLM-direct tagging tried and found inconsistent for
subjective properties; audio-ML-tags + LLM-as-judge at 0.7 threshold; a
tag-preference feedback loop across ML/LLM/human tag layers) and the
producer status-quo context (Blackhole/extraction tools + manual, ad hoc
tagging taxonomies). Asked for this to be reflected in the PRDs before
moving forward with further build work.

**Open questions for next session:**
- Exact names of the 3 open-source audio ML models (at least 2 needed for
  Genre/Mood specifically — instrument/type already has PANNs/YAMNet named).
  Placeholder `[MODEL NAME — TBD]` left in `prd-backend-pipeline.md` rather
  than guessing.
- Whether "trains the system on tag-preference over time" means the existing
  proposal-mining loop (cheap, already-designed-for) or actual model
  fine-tuning/personalization (materially larger scope) — touchpoint 6 is
  documented assuming the former until corrected.

**Confidence:** high that the PRD updates faithfully capture what the
maintainer described, without fabricating anything not stated (model names
left as explicit placeholders, not invented). Not yet re-verified against
any implementation, since none of this has been built yet.

---

## Session 2026-07-11 (cont.) — Post-capture HITL UI (feature/mvp-end-to-end-demo)

**Scope:** Maintainer chose to keep building rather than stop for a browser
check now, with one condition: keep it modular enough that debugging won't
require a full refactor. Built the post-capture tagging/review UI
(touchpoints 2, 3, 4, 6) on top of the existing capture engine + stub
backend, structured with dependency injection specifically so it's
unit-testable under jsdom instead of deferring all verification to the
eventual browser check.

**Changed:**
- `backend/server.js` — `/upload` response now includes `genre`/
  `genreConfidence`, `mood`/`moodConfidence`; mood confidence is randomized
  (`Math.random()`, stub-only — real pipeline's confidence comes from actual
  models, not chance) specifically to exercise both sides of the 0.7
  LLM-as-judge threshold locally. Below 0.7, response includes a
  `disambiguation` block (touchpoint 2). New `POST /feedback` endpoint
  (touchpoints 4 & 6) — logs the tuple server-side, 204 response.
- `extension/src/pipeline/types.ts` (new) — `Tags`, `UploadResult`,
  `Disambiguation`, `TagCorrectionFeedback`, `NamingFeedback` — shared shapes
  between the client and stub backend.
- `extension/src/pipeline/client.ts` (new) — `createPipelineClient(url)`
  wraps `upload`/`submitFeedback`/`downloadUrl` behind a `PipelineClient`
  interface, so UI code depends on an interface, not `fetch` directly.
- `extension/src/ui/capture-panel.ts` (new) — `mountCapturePanel(root, deps)`
  replaces the button-only logic that used to live directly in
  `content-script.ts`. Takes `{ startCapture, client }` as injected deps.
  State machine: idle → recording → uploading → reviewing. The reviewing
  panel renders all six tag fields (flagging any below 0.7 confidence
  inline), an inline disambiguation prompt when the backend sends one
  (submits a `tag_correction` on answer), an editable generated-name field
  (submits `naming_feedback` on change), and the download button.
- `extension/src/content-script.ts` — cut down to a ~15-line composition
  root: checks `getActiveAdapter()`, wires real `startCapture` +
  `createPipelineClient(BACKEND_URL)`, calls `mountCapturePanel`. All actual
  logic moved to the tested module above.
- `extension/src/ui/capture-panel.test.ts` (new) — 8 tests under jsdom,
  zero real browser/network/audio dependency: idle→reviewing state walk,
  low-confidence tags flagged inline, disambiguation prompt + tag-correction
  submission, naming-feedback submission (and non-submission when
  unchanged), download resets to idle, upload-failure path returns to idle
  and alerts.

**Broke / flaky:** Nothing broke. Independently verified:
- `npm run typecheck` — clean.
- `npm test` — 13/13 passing (5 adapter + 8 new panel tests).
- `npm run build` — bundle grew from 11.4kb to 16.2kb, still syntax-checks
  clean with `node --check`.
- Backend: restarted the real server (had to force-kill a stale instance
  left listening on :8787 from an earlier session — background processes
  across separate tool invocations don't share shell job-control, `kill %1`
  silently no-ops on the wrong shell; used `lsof -ti :8787 | xargs kill -9`
  instead) and ran 10 real uploads via `curl` — confirmed both sides of the
  0.7 threshold actually occur (saw confidences from 0.01 to 0.98,
  disambiguation present exactly when confidence < 0.7, absent at exactly
  0.70), and `POST /feedback` returns 204 and logs the tuple.

**Dependency notes:**
- This is the concrete answer to the "keep it modular" ask: `capture-panel.ts`
  takes its `startCapture` and `client` as constructor-style deps rather than
  importing `fetch`/`AudioContext` directly, exactly so the whole state
  machine and rendering logic could be tested here, today, without a
  browser. The only things still genuinely untestable from this environment
  are: real `MediaRecorder`/`AudioContext` behavior on live audio, real CORS
  behavior in an actual browser security context, and the site adapters'
  DOM selectors against live markup — all narrower, more isolated surfaces
  to debug than "the whole feature," which was the point.
- `Tags`/`UploadResult` types added here are the client-side shape; they
  don't yet reflect anywhere in a real DB (still Qdrant-as-placeholder,
  still no real backend) — this is stub-to-stub consistency, not a schema
  migration.

**Human feedback received:** Maintainer explicitly weighed "keep building,
test at the end" against my concern about stacking untested layers, and
opted to keep building — with the modularity condition above, which shaped
how this chunk was structured (DI + jsdom tests) rather than skipping tests
entirely.

**Open questions for next session:** Same as prior entry (Genre/Mood model
names; tag-preference training mechanism) — nothing here resolves those,
this was UI/plumbing work using the placeholder tags. Also still open: the
actual browser click-through, now covering three built layers (adapters,
capture engine, review UI) instead of two.

**Confidence:** high on everything listed as independently verified above.
Medium on whether the review panel's DOM (positioned same as the old button,
now a 280px-wide panel) will visually collide with site content on
YouTube/TikTok/Instagram's own layouts — same category of "needs a real
browser" gap as the button styling concern from the prior entry, now
slightly larger surface.

---

## Session 2026-07-11 (cont. 2) — Model selection research, PRD resolution (no branch — doc update)

**Scope:** Maintainer pasted research (their own + apparently another AI
session's output, mixed with unrelated payment-infrastructure/interview
content that was disregarded as accidental) proposing librosa/essentia/
musicnn/CLAP as tagging essentials, plus a "top 5" candidate list per
category, and asked to verify + pick ~3 deterministic / ~3 probabilistic
models, override with better methodology where warranted, and document
reasoning in the PRD. Also raised (quoting another AI's analysis) that
static pretrained models can't be retrained, so the tag-preference feedback
loop must work through the LLM-judge's prompt, not model fine-tuning.

**Changed:**
- `prd-backend-pipeline.md` section 3 — replaced the `[MODEL NAME — TBD]`
  placeholders with verified picks: BPM now librosa + aubio cross-check
  (concrete confidence mechanism via cross-algorithm agreement, previously
  undefined); Key stays essentia KeyExtractor (unchanged); Genre = musicnn
  cross-checked against PANNs/YAMNet; Mood = CLAP via text-audio embedding
  match against candidate phrases rather than a fixed class list. Documented
  three deliberate exclusions with reasoning (madmom, Essentia's own
  Genre-Discogs400/Mood-Jamendo models, OMAR-RQ — all non-commercial-only
  licenses; MOSS-Music — architectural mismatch, not a license issue).
  Tag-preference feedback loop section rewritten from "open question" to
  "resolved": periodic LLM-judge-prompt refinement via the existing
  aggregate-pattern-agent mechanism, not model retraining, since every model
  in the pipeline is a static pretrained artifact.
- `prd-overview.md` — both previously-open decisions (Genre/Mood model
  names; tag-preference training mechanism) marked `[x]` resolved, with full
  reasoning inline.
- `prd-hitl-review.md` touchpoint 6 — updated from "open question" framing
  to "resolved," same reasoning.
- `prd-database-schema.md` — `Tags` entity's genre/mood field comments
  updated from "model TBD" to the actual chosen models.

**Broke / flaky:** N/A — docs only.

**Dependency notes — license findings worth remembering:**
- **New copyleft flag:** `aubio` is GPLv3. Not previously in any PRD.
  Flagged per CLAUDE.md constraint #4's "anything else copyleft" clause
  (which explicitly isn't AGPL-only) — same treatment as essentia's AGPL.
- **Non-commercial-only licenses are the dominant landmine in this space,**
  not copyleft: `madmom`'s pretrained models (CC BY-NC-SA), Essentia's own
  Genre-Discogs400/Mood-Jamendo tagging models (CC BY-NC-ND — stricter,
  also no-derivatives), and `OMAR-RQ` (CC-BY-NC-SA) are all NC-restricted
  despite being "open source." All three excluded from the pipeline for
  this reason, not adopted-with-a-flag like the AGPL/GPL cases — NC terms
  don't have the same "fine if you disclose it" out that copyleft does for
  server-side-only use.
- **Verified, not trusted-on-paste:** none of librosa/essentia/aubio/
  madmom/musicnn/CLAP/PANNs/YAMNet/OMAR-RQ/MOSS-Music were taken at face
  value from the pasted research — each was independently searched and, for
  license specifics, fetched directly (e.g. CLAP's actual LICENSE file was
  fetched rather than trusting a search summary that hedged on the license
  type; it's CC0, more permissive than the pasted list implied by omission).
- **MOSS-Music excluded on principle, not just license** — worth restating
  because it's the one case where the "smarter methodology" override the
  maintainer explicitly invited actually mattered: an 8B-parameter
  LLM-based tagger would reintroduce the exact inconsistent-on-subjective-
  properties problem that motivated this whole pipeline redesign, plus
  real per-capture runtime cost, regardless of its license.

**Human feedback received:** Maintainer did their own research pass,
proposed a candidate model list (mixed with what looks like another AI
session's output pasted in), and explicitly invited overriding their opinion
with better reasoning where warranted — used that latitude on madmom/
Essentia-tagging-models/OMAR-RQ (license) and MOSS-Music (architecture).

**Open questions for next session:** None remaining from the tagging-model
research thread — both prior open decisions are now resolved. Still open
from earlier sessions: the actual browser click-through (now three built
layers: adapters, capture engine, review UI), and this doesn't yet change
any code — the stub backend still hardcodes fake tags rather than calling
these real models, which is real, separate build work if/when prioritized.

**Confidence:** high — every technical claim in this entry (license type,
repo existence, model architecture) was independently verified via search
and, where license specifics were ambiguous in search summaries, direct
LICENSE-file fetch, not carried over from the pasted research uncritically.

---

## Session 2026-07-14 — Multi-instrument detection + stem-extraction UX (no branch — doc update)

**Scope:** Maintainer asked two design questions that both turned out to be
real gaps, not hypotheticals: (1) whether fingerprinting was in the schema
(it was, but needed clarifying it's a different technology from the vector
embedding used for similarity search), and (2) whether the product can tell
when a sample has multiple simultaneous instrument layers (it couldn't —
`category` was single-valued). Also added a new HITL touchpoint: an
always-available "Extract Stems" button plus a conditional suggestion when
multi-instrument is detected, explicitly designed to log data for a
threshold-tuning pass the maintainer plans to do later.

**Changed:**
- `prd-backend-pipeline.md` — section 3: `category` → multi-label (PANNs/
  YAMNet already output per-class sigmoid scores, not single softmax picks;
  no new model needed, just stopped throwing away the rest of the output).
  Section 4: rewritten — extraction is now user-invokable regardless of the
  flag (previously gated entirely behind it); concrete trigger condition
  added (≥2 of the four stem-relevant buckets — vocals/drums/bass/other,
  matching `Stem.stem_type` and HTDemucs's own output — cross a *separate*
  0.5 threshold, explicitly not the 0.7 tagging threshold); cost-monitoring
  note added since manual triggering removes the automatic cost gate this
  feature used to have.
- `prd-hitl-review.md` — new **Touchpoint 7**: the extraction
  suggestion/button, logging every decision (`accepted` / `declined` /
  `manual_unflagged`) specifically so the 0.5/≥2-bucket defaults have real
  data behind them when the maintainer's planned tuning pass happens.
  Feedback-loop diagram and aggregate-agent description updated to include
  it.
- `prd-database-schema.md` — `Tags.category` renamed to `Tags.categories`
  (array of `{label, confidence}`); `HITLEvent.touchpoint` enum gains
  `stem_extraction_decision`.
- `prd-extension-client.md` — post-capture flow step 5 rewritten: button
  always shown, suggestion copy only appears when the flag fires.

**Broke / flaky:** N/A — docs only, no code touched. The capture-panel UI
built in the 2026-07-11 session still shows single-valued category and has
no stem-extraction UI at all — this PRD update is ahead of the code now,
not reflected in `capture-panel.ts`/`capture-panel.test.ts` yet.

**Dependency notes:**
- Deliberately did **not** collapse the stem-extraction confidence
  threshold into the existing 0.7 LLM-as-judge number — they answer
  different questions (classification reliability vs. presence of multiple
  layers) and conflating them would have been a modeling shortcut, not a
  simplification.
- Bucket collapsing (four buckets, not raw AudioSet's 527 classes) matters
  for correctness, not just tidiness: AudioSet's ontology is hierarchical/
  overlapping, so counting raw label hits above threshold would false-
  positive on a single instrument that happens to score high on two
  correlated labels (e.g. "Drum kit" + "Percussion" for one drum layer).
- Noted, not yet acted on: this repo's STATUS.md archival housekeeping was
  overdue (10 inline entries against the ~5 guideline) — moved everything
  through the 2026-07-08-03:00 entry to `docs/status-archive/2026-07.md`
  as part of this session, unrelated to the maintainer's actual ask but
  needed regardless.

**Human feedback received:** Maintainer explicitly separated two previously
conflated things — "does the system suggest stem extraction" vs. "can the
producer invoke it" — and said to keep the button unconditional. Also
explicitly said the 0.5/≥2-bucket numbers are starting points to fine-tune
later, not to be treated as final — documented them as exactly that, not as
a locked spec.

**Open questions for next session:**
- The `capture-panel.ts` UI (built 2026-07-11) needs updating to match:
  multi-label category display, the extraction suggestion + button, and
  wiring to a new HITLEvent-style feedback call for touchpoint 7 — none of
  this is implemented yet, only spec'd.
- The stub backend (`backend/server.js`) also needs updating to return
  multi-label `categories` and a stem-extraction-relevant bucket breakdown
  instead of its current single hardcoded `category: 'kick'`.
- Still outstanding from prior sessions: the actual browser click-through,
  and the DB-engine recommendation (Postgres + pgvector over Qdrant-only)
  raised in conversation but not yet written into `prd-overview.md`/
  `prd-database-schema.md` — maintainer hadn't confirmed that one yet as of
  this entry.

**Confidence:** high on the technical reasoning (PANNs/YAMNet's native
multi-label output, AudioSet's hierarchical-label false-positive risk, the
cost-gating implication of an unconditional button). Medium on the specific
0.5/≥2-bucket defaults — explicitly flagged by the maintainer as needing
real tuning, not something either of us has validated against actual
samples yet.

---

## Session 2026-07-14 (cont.) — Schema provenance fields (no branch — doc update)

**Scope:** Maintainer asked whether producer tag corrections should feed
back into AudioSet itself (answered: no — it's a static published dataset
with no contribution mechanism, mechanically not actionable, not just
inadvisable) and whether current metadata capture is sufficient. Confirmed
two real gaps from that discussion (model/version provenance, embedding
version) and added them to `prd-database-schema.md`, plus additional fields
predicted useful, as requested.

**Changed:** `prd-database-schema.md`:
- `Sample` gains: `capture_duration_seconds` (ties to the duration-handling
  UX, needed to evaluate whether it's actually changing behavior);
  `copyright_check_enforced` (bool, ties directly to the maintainer's own
  V0-optional-check note in `prd-backend-pipeline.md` section 2 — without
  it, V0-bypassed rows and real Tier-1-clear rows are indistinguishable
  later); `embedding_model_version` (the confirmed real gap);
  `pipeline_config_version` (nullable, explicitly flagged lower-priority/
  optional — a single version tag for threshold-tuning eval, not per-field
  granularity).
- `Tags` gains: `multi_instrument_detected` (bool, denormalized from
  touchpoint 7 for query convenience — same reasoning as the existing
  `disambiguation_triggered` field); `model_versions` (JSON, one field
  covering all contributing tools since BPM and Genre each already involve
  more than one — the confirmed real gap).
- `Stem` gains: `separation_model_version` alongside the existing
  `separation_model_used` — same provenance principle applied to stem
  extraction specifically, prompted by the maintainer highlighting the
  HTDemucs/Mel-Roformer/MDX-Net model-choice lines while asking this
  question.

**Broke / flaky:** N/A — docs only.

**Dependency notes:** None of this is implemented — `backend/server.js`'s
stub still returns none of these fields, and nothing reads/writes a real DB
yet (still Qdrant-only per the unconfirmed open decision, or Postgres+
pgvector per the recommendation from a few sessions ago — whichever gets
picked, these fields apply to either).

**Human feedback received:** Maintainer's AudioSet question surfaced that
the "static pretrained model" resolution from two sessions ago generalizes
one level further (the training dataset, not just the model, is also
outside this project's control) — good confirmation the earlier
architecture call was right, not a new decision. Maintainer explicitly
invited predicting additional useful fields beyond the two confirmed gaps;
used that latitude for `capture_duration_seconds`, `copyright_check_enforced`,
`multi_instrument_detected`, `separation_model_version`, and the
lower-priority `pipeline_config_version`.

**Open questions for next session:** Still unconfirmed: the Postgres+
pgvector recommendation from earlier (schema doc still describes Qdrant/
graph framing in "Why vector + graph, not just relational" — not touched
this session since that recommendation itself hasn't been confirmed yet).
Everything added this session applies regardless of which engine is chosen.

**Confidence:** high on the AudioSet mechanical answer (it's a published
dataset, not a live service — not a judgment call). Medium-high on the new
fields — each ties to an explicitly stated project goal or existing schema
precedent, not speculative additions, but none are validated against an
actual running pipeline yet since none of this is built.

---

## Session 2026-07-14 (cont. 2) — Raw multi-model tag candidates (no branch — doc update)

**Scope:** Maintainer, reviewing the schema directly, caught that only the
arbitrated/finalized tag value is stored per field (`bpm`, `genre`, `mood`)
— the individual model candidates that fed into that decision (e.g.
librosa's and aubio's separate BPM readings, CLAP's runner-up mood matches)
aren't persisted anywhere, only the merged result and its confidence.
Confirmed this as a real, maintainer-identified gap and added the fix.

**Changed:**
- `prd-database-schema.md` — `Tags` gains `raw_model_outputs` (JSON): every
  contributing model's candidate value (+ confidence, where the model
  provides one) per field. Noted explicitly that `categories` doesn't need
  this — it already stores every above-threshold label, not just top-1,
  from the earlier multi-label fix; the gap was specifically the
  cross-check/embedding-match fields where only the winner survived.
- `prd-hitl-review.md` touchpoint 2 — tightened to state explicitly that
  the disambiguation prompt's options are drawn from `raw_model_outputs`,
  not generated separately — this was already true operationally (the
  prompt has to come from *some* candidate data) but the schema didn't
  reflect it, so the same data was being computed transiently and thrown
  away instead of persisted.

**Broke / flaky:** N/A — docs only.

**Dependency notes:** This is additive to, not a replacement for, the
`model_versions` field added earlier this session — `model_versions`
records *which* tools ran and what version; `raw_model_outputs` records
*what each one said*. Together they're the full provenance chain: which
models ran → what each candidate output was → what the LLM-judge/
arbitration decided → (optionally) what the producer corrected it to
(already captured via `HITLEvent.tag_correction`, touchpoint 6). Before
this session, only the last two links of that chain were captured.

**Human feedback received:** Maintainer caught this independently while
reviewing the schema doc, not prompted by a question from me — a real
architectural gap, not a hypothetical. Framed accurately as "the LLM eval
loop cherry-picks the most confident tag but the schema only logs the
chosen one," which is exactly right and is now fixed.

**Open questions for next session:** None new from this specific change.
Still outstanding from prior sessions: Postgres+pgvector recommendation
unconfirmed; nothing in this schema is implemented in code yet (stub
backend/capture-panel still reflect the pre-Genre/Mood, pre-multi-label,
pre-provenance schema entirely).

**Confidence:** high — this follows directly from patterns already
established in the schema (`DisplayName`'s detected→proposed→corrected
tuple, `categories`' full-label-set storage) applied to a place they hadn't
been applied yet, not a new design principle.

---

## Session 2026-07-14 (cont. 3) — Retrieval-augmented judging + producer identity (no branch — doc update)

**Scope:** Maintainer clarified the long-term improvement vision after a
question about whether the LLM-judge already is an "arbitrator" (it is,
functionally — clarified the actual distinction is *how it improves*:
prompt edits vs. trained weights, not "arbitrates vs. doesn't"). Maintainer
then stated the real goal: the judge should incorporate historical
confidence + producer commentary, and recommendations should eventually
align with either the individual producer or the broader producer
community.

**Changed:**
- `prd-backend-pipeline.md` section 3 — named and tabled three distinct
  improvement mechanisms so they stop getting conflated: static prompt
  refinement (built), **retrieval-augmented judging** (new — the judge's
  per-call context includes retrieved per-model historical accuracy +
  relevant past `producer_comment` text, not just the current sample's
  candidates; needs no new infra beyond what's already in the schema), and
  a trained arbitrator (discussed, not planned). Added a "Longer-term
  direction" subsection documenting the producer-alignment/personalization
  goal as a real, explicit scope expansion — with two open questions
  flagged rather than assumed: what "producer community" means as a data
  source (internal multi-user aggregation vs. external dataset blending),
  and how individual vs. community preference gets reconciled when they
  conflict.
- `prd-database-schema.md` — added `producer_id` to both `Sample` (who
  captured it) and `HITLEvent` (who corrected/rated it, kept separate from
  Sample's since these can diverge once multi-producer use exists). Single
  hardcoded value for now (no auth system, local single-user), added
  specifically so today's data isn't structurally single-tenant if/when
  personalization becomes real — retrofitting identity onto historical
  rows after the fact isn't possible.

**Broke / flaky:** N/A — docs only.

**Dependency notes:** Retrieval-augmented judging is buildable now with
existing schema (`Tags.raw_model_outputs`, `HITLEvent.tag_correction`) plus
a retrieval step before the judge call — no new infrastructure, still
squarely "the judge's context improves," not training. The
personalization/community direction is explicitly aspirational — flagged
as likely needing the trained-arbitrator path eventually (per-producer
weighting is closer to "fit a model to this producer's history" than
"retrieve context for a general judge"), but not spec'd further since two
real open questions block doing so responsibly right now.

**Human feedback received:** Maintainer confirmed the long-term improvement
direction explicitly: judge should use historical confidence + producer
commentary, and recommendations should eventually align with individual or
community producer preference. This is a genuine scope statement, not a
hypothetical — treated accordingly (schema changes made now, not deferred),
while keeping the genuinely unresolved parts (community data source,
conflict resolution) as open questions rather than guessed at.

**Open questions for next session:**
- What "producer community" means as a data source — asked the maintainer
  directly, not yet answered as of this entry.
- How individual vs. community preference reconciles when they conflict,
  and how cold-start (new producer, no history) is handled.
- Retrieval-augmented judging has no concrete retrieval mechanism spec'd
  yet (what counts as "relevant" history, how much to retrieve, recency
  vs. relevance weighting) — named and justified, not designed in detail.

**Confidence:** high on the mechanism taxonomy (prompt edit vs. retrieval
vs. training are genuinely different upgrade paths, not just semantics) and
on the `producer_id` addition (low-cost now, expensive to retrofit later —
not a judgment call). Low on the personalization/community direction's
eventual shape — correctly flagged as open rather than guessed.

---

## Session 2026-07-14 (cont. 4) — "Producer community" question resolved (no branch — doc update)

**Scope:** Maintainer answered the open question from the prior entry:
"producer community" means internal aggregation across this product's own
future multi-user base at production scale, not blending external
community-tagged datasets.

**Changed:** `prd-backend-pipeline.md` section 3 — marked that open
question resolved. Noted the practical upshot: no new schema needed beyond
the `producer_id` already added — individual alignment is `tag_correction`
events filtered to one producer, community alignment is the same events
aggregated across all producers. One data source, two query shapes.

**Broke / flaky:** N/A — docs only.

**Dependency notes:** This axis is entirely moot at current scale (single
local producer) — nothing to build until production has more than one
producer generating corrections. `producer_id`'s only job right now is
making sure today's single-user data is attributable later instead of
discarded.

**Human feedback received:** Maintainer confirmed option (a) — internal
multi-user aggregation, explicitly framed as a production-scale concern,
not something needed now.

**Open questions for next session:** The individual-vs-community conflict-
resolution question (which one wins when a specific producer's preference
differs from consensus) and cold-start handling remain open — this
session's answer resolved *what the data source is*, not *how the two
signals get reconciled*. Not urgent given current single-user scale.

**Confidence:** high — direct maintainer confirmation, not an inference.

---

## Session 2026-07-14 (cont. 5) — Live-test findings: crash fix + full-duration default (feature/mvp-end-to-end-demo)

**Scope:** First real browser test pass (YouTube, TikTok, Instagram) surfaced two real issues: a hard crash on TikTok, and captures only grabbing a manual clip instead of the full source. Fixed both while maintainer moved on to testing radio-stream.

**Changed:**
- New `extension/src/adapters/shared-audio-node.ts` — `getOrCreateSourceNode()`, a `WeakMap`-cached wrapper around `createMediaElementSource()`. Root cause of the TikTok crash: that API throws `InvalidStateError` if called twice on the same DOM element, ever — confirmed live (TikTok's feed recycles the same `<video>` element across scroll positions, so a second capture attempt hit an element that already had a source node from an earlier one).
- `extension/src/capture/capture-engine.ts` — rewritten: one shared, lazily-created `AudioContext` for the page's lifetime instead of a fresh one (immediately closed) per capture — required for the cache above to mean anything, since a `MediaElementAudioSourceNode` is permanently bound to the context that created it. Also: `CaptureHandle` reshaped from `stop(): Promise<result>` to `{ result: Promise<result>, stop(): void, autoStops: boolean }`. `autoStops` (`Number.isFinite(element.duration) && element.duration > 0`) drives new default behavior — known-duration sources seek to 0, auto-play, and auto-stop at the `ended` event, capturing the whole thing; indeterminate-duration sources (radio streams) keep today's manual start/stop.
- `extension/src/adapters/types.ts` + all five adapters — added `getMediaElement(): HTMLMediaElement`, since the engine needs the raw element (to seek/play/listen for `ended`), not just the audio graph node `getAudioNode()` provides.
- `extension/src/ui/capture-panel.ts` — click handler restructured: one `handleClick()` invocation now spans the whole recording→result lifecycle (awaiting `capture.result`, which resolves either on its own or via a second click calling `.stop()`), instead of splitting start/stop across two independent per-click branches. Button label distinguishes the two modes: "Recording full capture… (click to stop early)" vs. the existing "Stop & Upload".
- `extension/src/ui/capture-panel.test.ts` + `extension/src/adapters/registry.test.ts` — updated fakes for the new `CaptureHandle`/`SiteAdapter` shapes; added two new tests (auto-stop finishes without a second click; manual mode still shows the old label).

**Broke / flaky:** Nothing broke. `npm run typecheck`, `npm test` (15/15, 2 new), and `npm run build` (18.6kb, syntax-checked) all clean.

**Dependency notes:**
- **Confirmed via live testing, not assumed:** the underlying audio-tap mechanism itself works — maintainer confirmed captured audio played back correctly on YouTube. The bugs were scope (partial clip vs. full video) and a crash on element reuse, not "capture doesn't work at all."
- Full-duration auto-capture means a long video now takes that same real wall-clock time to capture (no way around this with a real-time audio tap) and produces a correspondingly large file, with no slicing UI yet to let the user pick a sub-range for long sources — the wavesurfer-based waveform-slice UI is still unbuilt, flagged as its own task in `prd-extension-client.md` already. Did not build the >600s "skip tagging, force direct download" rule from that same doc in this pass — out of scope for what was asked here, noted as a related follow-up.
- **Not yet built:** the Turbodownloader-style per-element overlay buttons + `MutationObserver`-based dynamic attachment for TikTok/Instagram feeds (multiple simultaneous/dynamically-loading videos) — maintainer explicitly deferred this to its own pass after the current single-target adapter test sweep finishes. `capture-engine.ts`'s new per-element source-node cache is a prerequisite piece of that future work, already in place.

**Human feedback received:** Maintainer reported both issues directly from live testing with the exact error trace for the crash (invaluable — pinpointed the root cause immediately rather than needing to reproduce). Explicitly requested full-duration-by-default with manual fallback only for unrecognized-duration sources, and confirmed the Turbodownloader-style fix applies to both Instagram and TikTok's multi-video situation.

**Open questions for next session:**
- Re-test YouTube/TikTok/Instagram against this fix — none of it has been through a real browser yet, same category of gap as everything else in this codebase.
- Turbodownloader-style per-element buttons + MutationObserver: still fully unscoped as an implementation, though the audio-node caching groundwork is now in place.
- Radio-stream and generic fallback still need their first live test (in progress as of this entry, per the maintainer).

**Confidence:** high on the crash-fix mechanism (the per-element restriction is documented Web Audio API behavior, and the fix directly addresses the exact confirmed error trace). Medium on the full-duration auto-capture UX for very long sources — functionally correct but the long-capture-time/large-file experience is unrefined without the slicing UI, which is known and already tracked, not a surprise.

---

## Session 2026-07-14 (cont. 6) — Popup + chrome.tabCapture fallback (feature/mvp-end-to-end-demo)

**Scope:** Radio-stream adapter didn't show a button during live testing. Maintainer's response: stop trying to solve in-page detection for radio/arbitrary streams — instead add a page-agnostic manual capture path via the extension's own toolbar popup, using `chrome.tabCapture`. Explicitly deprioritized further adapter-detection investment in favor of this simpler V0 mechanism.

**Changed:**
- `extension/manifest.json` — added `"tabCapture"` permission and
  `"action": { "default_popup": "popup.html" }`.
- New `extension/popup.html` + `extension/src/popup.ts` — standalone
  popup UI (Record/Stop-and-Upload button), reusing the existing
  `pipeline/client.ts` for upload/download so it's not a parallel
  implementation of that logic.
- New `extension/src/capture/tab-capture-engine.ts` — `startTabCapture(tab)`
  wraps `chrome.tabCapture.capture()` in a promise, returns the same
  `CaptureHandle` shape (`result`/`stop`/`autoStops`) as the adapter-based
  engine so the two capture paths are interchangeable from a caller's
  perspective. `autoStops` is always `false` here — no adapter means no
  known duration.
- `extension/src/adapters/types.ts` — new `SourcePlatform` value
  `manual_tab_capture` to distinguish this path from the DOM-adapter
  `generic` fallback in logged metadata.
- `extension/package.json` — build script now bundles two entry points
  (`content-script.ts` and `popup.ts`) via esbuild's `--outdir`, since
  `chrome.tabCapture` is only available to extension pages, never content
  scripts — this genuinely can't live in the same bundle.
- Added `@types/chrome` devDependency for `chrome.tabCapture`/`chrome.tabs`
  typings.
- `prd-extension-client.md` — documented the V0 design change (popup
  fallback instead of solving stream detection), and updated the
  DRM-protected-sources section: what was scoped as a *second, DRM-specific*
  capture mode turns out to be the exact same mechanism as this general
  fallback — one implementation covers radio streams, arbitrary
  unrecognized audio, and DRM platforms, not three separate builds.

**Broke / flaky:** Nothing broke. `npm run typecheck`, `npm test` (15/15,
unchanged), and `npm run build` (both `content-script.js` 18.6kb and
`popup.js` 4.3kb, both syntax-checked with `node --check`) all clean.
`manifest.json` re-validated as parseable JSON after edits.

**Dependency notes:**
- **Real, deliberately-flagged limitation, not a bug to silently accept:**
  a Chrome extension popup's JS context is destroyed when it loses focus
  (any outside click, tab switch) — closing the popup mid-recording
  silently kills the capture. The robust fix is a `chrome.offscreen`
  document behind the background service worker; not built for V0. Flagged
  to the maintainer before building, given the choice, and the simpler
  popup-only version was the one that matched the project's consistent V0
  pattern of choosing speed over robustness for now.
- This has **not been tested in a real browser at all** — it's new code,
  same category of gap as everything else: typecheck/build/unit-test clean,
  zero live verification yet. `chrome.tabCapture.capture()`'s exact behavior
  (permission prompts, whether it silently fails on certain tab types) is
  unconfirmed.
- Metadata for this path is minimal by design (`title`/`sourceUrl` from
  `chrome.tabs.query`, no uploader/date signal — there's no adapter to
  extract it) — expected, not a gap to fix.

**Human feedback received:** Maintainer explicitly deprioritized solving
radio-stream/generic detection further, in favor of routing to a manual
popup-based capture. Confirmed the full-duration-by-default behavior should
stay adapter-side ("if there is an adapter, the parser should extract the
full audio from the element selected") — this session didn't change that,
only added the fallback for when there isn't one.

**Open questions for next session:**
- First live test of the popup + tabCapture flow — entirely unverified.
- Whether the popup-closes-mid-recording limitation needs the
  `chrome.offscreen` upgrade, once it's been felt in practice rather than
  just reasoned about.
- Radio-stream/generic adapters' live-DOM test status is now lower
  priority given the popup fallback, but still technically untested from
  the original test plan.

**Confidence:** high on the API usage being structurally correct
(`chrome.tabCapture.capture()`'s documented signature, permission
requirements) — medium-low on real-world behavior, since none of it has
run in an actual browser yet.

---

## Session 2026-07-14 (cont. 7) — tab-capture audibility fix + V1 CDN-scrape flagged, not built (feature/mvp-end-to-end-demo)

**Scope:** Two pieces of feedback: (1) tab-capture recording left the user
unable to hear the tab live — real bug, fixed; (2) request to make YouTube/
TikTok/Instagram capture instant (no real-time wait) like a "YouTube to MP3"
converter, and a follow-up asking whether an off-the-shelf downloader/API
would avoid the legal concerns raised. Explained why it wouldn't and
recommended against building it; maintainer directed documenting it as a
V1 plan rather than dropping it, which is what this entry covers.

**Changed:**
- `extension/src/capture/tab-capture-engine.ts` — `chrome.tabCapture`
  mutes the tab's normal output once captured (confirmed live, and it's
  documented Chrome behavior, not a bug in this code specifically). Fixed
  by creating an `AudioContext` in the popup, routing a
  `MediaStreamAudioSourceNode` from the captured stream back to
  `audioContext.destination` — same "tap AND stay audible" pattern
  `shared-audio-node.ts` already established for the adapter path.
- `prd-overview.md` — added a new, explicitly-unresolved open decision:
  maintainer's stated V1 plan to add CDN/private-API scraping (off-the-
  shelf tools, e.g. yt-dlp-style) for instant full-file extraction on
  YouTube/TikTok/Instagram. Documented faithfully but with the legal
  framing preserved in full, not softened: every capture mechanism built
  so far records rendered output during authorized playback and never
  bypasses a platform's delivery mechanism; CDN scraping does bypass it,
  which is a categorically different risk (concrete precedent cited:
  yt-dlp's 2020 DMCA notice, youtube-mp3.org's 2017 shutdown via lawsuit).
  Explicitly noted "off the shelf" doesn't reduce this exposure — that
  principle applied earlier to pretrained audio-ML models (a licensing
  question), not to access-bypass tools (a legal-exposure question).
  Also explicitly distinguished from the DRM/tab-capture open decision:
  that item's "prototype now, legal review before public distribution"
  gate works only because tab-capture never bypasses anything — here the
  bypass itself, not audience size, is the issue, so recommended the legal
  review gate sit *before* implementation starts, not before distribution.

**Broke / flaky:** N/A for the doc change. The tab-capture audibility fix
was typechecked/tested/built clean (`npm run typecheck`, `npm test` 15/15,
`npm run build` — both bundles), consistent with the rest of today's
changes, but like everything built today has not run in a real browser yet.

**Dependency notes:** The CDN-scrape item is recorded as an open decision,
not a task — no implementation should start on it without the legal review
called for in the PRD entry landing first. Architect recommendation (in the
PRD, not just this log) is against building it at all; documented per the
maintainer's explicit instruction to record the V1 intent, not because the
recommendation changed.

**Human feedback received:** Maintainer asked directly whether an
off-the-shelf tool/API would sidestep the legal concern raised (it doesn't,
explained why); asked about a specific product ("Turbodownloader") having
an API (no evidence found, didn't guess); then directed adding this as a
documented V1 plan regardless, which was done faithfully without
softening the risk framing already established.

**Open questions for next session:** Whether/when legal review of the
CDN-scraping approach actually happens — a hard prerequisite per the PRD
entry, not scheduled. Which library/API, if any, gets chosen — deliberately
left unresolved, flagged as its own decision.

**Confidence:** high on the tab-capture audibility fix (well-understood,
documented `chrome.tabCapture` behavior, directly matches the reported
symptom). High on the legal distinction drawn in the PRD entry (grounded in
concrete, verifiable precedent — yt-dlp's takedown history, youtube-mp3.org's
shutdown — not speculation) — but note this is architect-level flagging, not
actual legal counsel, and the PRD entry itself says so.
