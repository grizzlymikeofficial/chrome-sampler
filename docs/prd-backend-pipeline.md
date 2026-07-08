# PRD: Backend Processing Pipeline

## Design principle

Default to deterministic/classical algorithms. Escalate to an LLM only where
the task is reasoning over ambiguous language/context, not audio perception.
Every LLM call in this pipeline should be justifiable as "an algorithm cannot
make this judgment call," not "an LLM would also work."

---

## 1. Recognition

Handled entirely client-side by site adapters (see `prd-extension-client.md`).
The backend receives already-identified metadata; no recognition logic lives
server-side.

---

## 2. Copyright check — tiered cascade, blocking in production

No admin toggle for notify-only in prod. A blocked capture never reaches the
tagging stage or the database.

**Tier 1 — Chromaprint / AcoustID fingerprint match**
Deterministic, near-zero cost. Catches exact/near-exact rips. Query against
the open AcoustID database first; coverage gaps expected for long-tail or very
recent commercial tracks.

**Tier 2 — Landmark-hash matching (Panako or equivalent)**
Deterministic. Specifically targets pitch-shifted/time-stretched audio, which
plain fingerprinting misses and which producers commonly produce.

**Tier 3 — Commercial fingerprinting API fallback**
Paid, called only on Tier 1/2 misses (not per-capture) to cover catalog gaps
in the open databases. Vendor TBD — budget-dependent, see open decisions in
`prd-overview.md`.

**Tier 4 — LLM reasoning agent (only remaining ambiguous cases)**
Inputs: uploader type signal, upload date vs. estimated original release date,
source platform, title/description text, and the fact that Tiers 1-3 found no
match. Outputs: block/allow decision + a short logged rationale (private audit
log only, never shown to the end user).

This tier should encode general norms (how commercial rips typically get
mislabeled, what "official audio" / "topic channel" conventions imply,
how radio-archive vs. platform-native content differs) as a rubric in the
system prompt — there is no clean labeled dataset for this, so the rubric
itself is a first-class artifact that should live in version control and get
refined via the aggregate-pattern feedback loop (see `prd-hitl-review.md`).

**Cost control:** the whole point of the cascade order is that the large
majority of captures resolve at Tier 1 or 2, for effectively free. Tier 4
volume should be monitored — a spike suggests Tiers 1-3 need tuning, not that
Tier 4 needs to get smarter.

---

## 3. Tagging — algorithmic first, LLM only below 70% confidence

**Algorithmic (no LLM, runs on every cleared capture):**
- BPM: `essentia` RhythmExtractor2013 or `librosa.beat.beat_track`
- Key: `essentia` KeyExtractor
- One-shot vs. loop: heuristic (duration + onset density + tempo-lock check),
  not ML
- Instrument/type classification (vocal/drum/pad/fx/kick/snare/etc.): PANNs
  or YAMNet pretrained on AudioSet, run locally

**Licensing note:** essentia's default build is AGPL. Prefer `librosa`
(ISC-licensed) wherever it covers the need; use essentia only for extractors
librosa lacks, and flag that choice explicitly in code review.

**LLM disambiguation agent — triggers only when confidence < 70%:**
Fed structured output from the algorithms (e.g., two candidate BPM readings
and their ratio, competing key candidates), not raw audio. Job is to frame
the ambiguity as a clear yes/no or pick-one question for the producer
(see `prd-hitl-review.md` touchpoint 2), not to independently re-detect BPM/key.

**LLM naming/enrichment agent — runs on every tagged sample:**
Takes the structured tags (e.g. "kick, 128bpm, Cmin, one-shot") and proposes a
human-searchable name (e.g. "deep sub kick, minor, trap-adjacent"). This is a
language task an LLM is well-suited to; the structured tags remain the source
of truth for filtering/search, the generated name is a display/search-alias
layer on top. Producer edits to this name are the input to HITL touchpoint 4.

---

## 4. Stem extraction — multi-algorithm, DSP-scored (no LLM judging audio)

Runs only when tagging flags the capture as layered/multi-instrument music.

- Run candidate separations from more than one model where budget allows:
  HTDemucs (general 4-stem, current open-source SOTA) and Mel-Roformer or
  MDX-Net (vocal-isolation specialists) — pick per use case rather than always
  running all three, to manage compute cost.
- Score outputs with an objective DSP metric (spectral leakage / SDR-proxy
  estimating bleed between separated stems), not an LLM listening pass.
- Periodic (not per-file) multimodal-LLM spot-checks on a small sample of
  outputs to validate the DSP scorer stays aligned with human judgment over
  time — a calibration task, not a runtime dependency.
- Stems are stored as children of the raw-file record in the database
  (see `prd-database-schema.md`).

---

## 5. Aggregate pattern / error-detection agent

Not part of the per-capture hot path. A periodic job (e.g. daily) that reads
STATUS.md, the naming-feedback logs, and the Tier 4 copyright audit log, and
writes findings to `architecture-notes.md` for dev agents to act on next
session. See `status-log-protocol.md` and `prd-hitl-review.md`.
