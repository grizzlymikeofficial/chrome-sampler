# PRD: Browser Sample Capture & Analysis Extension — Overview

## What this is

A Chrome extension that captures audio playing in the browser (YouTube, TikTok,
Instagram, radio-streaming sites, and generic `<audio>`/`<video>` sources),
runs it through an automated analysis pipeline, and gives producers a clean,
free sample/stem to download. A private backend database logs every capture
for the maintainer's own analysis of pipeline quality & tagging eval improvement — it is **not** a public sample marketplace.

## Who it's for

Producers who want free samples and stems, pulled from audio they don't have
studio files for, who will heavily process/layer what they download. Cost per
user must trend toward zero — this shapes every architecture decision below.

## Status quo & why this exists

Today, producers get browser audio into their DAW one of two ways: routing
it through an internal/loopback audio router (e.g. Blackhole) while it plays,
or pulling the full file with a generic extraction tool. Either way, tagging
happens manually afterward — BPM, Key, Genre, Mood, One-Shot vs. Loop — and
every producer's tagging taxonomy is their own. Various people have tried to
systematize this with deterministic algorithms and/or audio ML models, with
mixed success.

This product's tagging design has its own origin story worth preserving as
context for why the cascade below looks the way it does: an earlier version
tried tagging directly via an LLM API call per sample. That worked
inconsistently — deterministic audio properties (BPM, Key) turned out to be
stable and cheap via classical DSP, while subjective properties (Genre, Mood)
stayed genuinely probabilistic no matter how the LLM was prompted. That split
is why the pipeline below runs local audio ML models for tag generation
(cost stays near-zero, per constraint #3) and uses an LLM strictly as a judge
over those models' confidence — never as a first-pass tagger — routing
low-confidence tags to the producer instead of guessing. See
`prd-backend-pipeline.md` section 3 for the resulting cascade, and
`prd-hitl-review.md` touchpoints 2 and 6 for how producer corrections feed
back into the system over time.

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
Tagging engine (local audio ML models: BPM/Key/Type/Genre/Mood)
        |
        v
LLM-as-judge (confidence gate, 0.7 threshold) -> auto-finalize OR producer review
        |
        v
Stem extraction (multi-algorithm + DSP-based scorer, no LLM)
        |
        v
Vector-graph database (private)
        |
        v
HITL surfaces (quality rating, naming feedback, tag correction, usage-match flag)
        |
        v
Aggregate pattern agent -> STATUS.md / architecture-notes.md -> dev agents
        |
        v
Tag-preference feedback loop (ML-tag / LLM-judged-tag / producer-final-tag
history informs future tagging — mechanism TBD, see open decisions)
```

## Document map

| File | Covers |
|---|---|
| `prd-extension-client.md` | Chrome extension UI, capture flow, site adapters |
| `prd-backend-pipeline.md` | Recognition, copyright cascade, tagging, stem extraction |
| `prd-database-schema.md` | Vector-graph DB schema, what's logged and why |
| `prd-hitl-review.md` | All HITL/feedback loops, UI copy, logging format |
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
- [ ] **Legal review of tab/system-audio capture for DRM-protected platforms
      (Netflix, Prime Video, etc.) — gated to pre-public-launch, not
      pre-prototyping.** Project is currently a local-only research/
      case-study prototype, not publicly distributed. Capture mechanism is
      `chrome.tabCapture`/`getDisplayMedia` recording already-decrypted,
      already-rendered output ("analog hole" — equivalent to system/loopback
      audio into a DAW), not decrypting or manipulating the DRM stream
      itself, which likely weakens the DMCA anti-circumvention angle
      specifically. Local prototyping may proceed on this basis. It does
      **not** address platform ToS exposure: most streaming services' terms
      prohibit recording/downloading regardless of mechanism, independent of
      circumvention law — **full legal review of that ToS exposure is
      required before any public distribution** of a build that includes
      this feature. Fixed boundary regardless of project stage: no actual
      DRM defeat (key extraction, manifest/segment decryption stripping,
      CDM bypass) — categorically out of scope, not just deferred. See
      `prd-extension-client.md`, "DRM-protected sources."
- [x] **Which specific open-source audio ML models generate Genre and Mood
      tags — resolved.** Maintainer named librosa/essentia/musicnn/CLAP as
      essentials and asked for research into the broader field; verified all
      candidates directly (existence + license, not taken on faith from a
      pasted list) before deciding. **Genre:** `musicnn` (Jordi Pons, ISC),
      cross-checked against PANNs/YAMNet's genre-adjacent labels. **Mood:**
      `CLAP` (LAION-AI, CC0) via text-audio embedding matching against
      candidate mood phrases, not a fixed class list. **BPM** also revised:
      `librosa` primary, cross-checked against `aubio` (GPLv3 — flagged) for
      an actual confidence mechanism (agreement between two independent
      algorithms), rather than trusting one library's internal number.
      Deliberately excluded: `madmom` (CC BY-NC-SA pretrained models,
      non-commercial only), Essentia's own Genre-Discogs400/Mood-Jamendo
      models (CC BY-NC-ND, same problem plus stacks on the AGPL code
      license), `OMAR-RQ` (CC-BY-NC-SA, SOTA but non-commercial), and
      `MOSS-Music` (excluded on architectural grounds, not license — an
      8B-parameter LLM-based tagger reintroduces exactly the
      inconsistent-on-subjective-properties problem and runtime cost this
      pipeline redesign was meant to avoid). Full rationale in
      `prd-backend-pipeline.md` section 3.
- [x] **What "trains the system on tag-preference over time" actually
      means, mechanically — resolved.** Settled by a simple fact: every
      model above (librosa, aubio, essentia, PANNs/YAMNet, musicnn, CLAP) is
      a static pretrained artifact, not something this project owns or can
      retrain. So the feedback loop cannot mean model fine-tuning — it means
      the LLM-as-judge's own prompt/instructions improve from corrections
      over time (periodic prompt refinement via the aggregate pattern
      agent, same proposal-mining mechanism already built for naming
      feedback — no new training infrastructure). See
      `prd-backend-pipeline.md` section 3 and `prd-hitl-review.md`
      touchpoint 6.
- [ ] **V1 plan (maintainer-stated, not yet legally reviewed): CDN/
      private-API scraping for instant full-file extraction on YouTube,
      TikTok, and Instagram, via off-the-shelf tools (e.g. yt-dlp-style
      libraries/APIs) rather than built in-house.** Intent is to remove the
      real-time-playback wait inherent to the capture mechanisms actually
      built so far (site-adapter DOM tapping, popup tab-capture —
      `prd-extension-client.md`, Capture engine). **Flagging plainly, not
      resolving:** every capture path built to date works by recording the
      *rendered output* of content already playing through the platform's
      own player — none of them bypass the platform's delivery mechanism.
      CDN/private-API scraping does bypass it, extracting direct media URLs
      the player never exposes to the end user — the same category of
      activity that got `yt-dlp` DMCA-noticed (RIAA → GitHub, 2020) and got
      hosted "YouTube-to-MP3" services sued and shut down (e.g.
      youtube-mp3.org, 2017).
      - **"Off the shelf" doesn't reduce this exposure.** Unlike the
        audio-ML-model "off the shelf is fine" calls above (licensing
        decisions on pretrained classifiers), this is a legal-exposure
        decision — importing someone else's extraction code carries the
        same exposure as writing it in-house.
      - **Structurally different from the DRM/tab-capture item above, not
        the same kind of item with a different platform name.** That
        item's "local prototype now, legal review before public
        distribution" gate works specifically because tab-capture never
        bypasses anything. Here, the bypass itself — not audience size —
        is what's at issue, so that gate placement doesn't transfer.
      - **Architect recommendation (not final — maintainer's call):** do
        not build this. If pursued, full legal review should happen
        *before* any implementation starts, not gated to public
        distribution. Platform selection, specific library/API choice, and
        legal sign-off should be treated as separate decisions, not
        bundled into one V1 line item.
