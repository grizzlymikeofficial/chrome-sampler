# Bug List

Tracked defects that don't block the task they were found in, per maintainer
triage. Not a substitute for STATUS.md/architecture-notes.md — this is just
a flat backlog so known-but-deprioritized issues don't get lost or
re-discovered from scratch. Append new entries at the bottom; update status
in place (this file isn't append-only like STATUS.md).

| ID | Found in | File / location | Description | Severity | Status | Notes |
|---|---|---|---|---|---|---|
| BUG-001 | `docs/reviews/review-001-recognition-adapters.md` | `extension/src/adapters/youtube.ts:29` (`inferUploaderType`) | Verified-badge check (`document.querySelector('[aria-label="Verified"]')`) is unscoped to the whole document. YouTube watch-page sidebars routinely show recommended videos from verified channels, so this can misclassify `uploaderType` as `artist_channel` for unrelated, non-verified videos — a scoping bug, not a stale-selector issue. Feeds a wrong signal into Tier 4 copyright reasoning (`prd-backend-pipeline.md`), but that tier already treats uploader-type as one coarse signal among several, not a standalone gate — hence non-critical for now. | Low (deprioritized by maintainer 2026-07-08 — not currently blocking) | Open | Related: `getChannelName()` selectors (`youtube.ts:11-16`) have the same unscoped-query root cause — likely fixed together. Fix direction: scope both queries to the primary channel/owner container near the video player instead of `document`-wide. |
| BUG-002 | Live manual test, 2026-07-14 | `extension/src/adapters/instagram.ts` (`getCaptionText`) | Confirmed via live testing: title comes back empty on real Instagram posts. `getCaptionText()`'s selector (`'h1, article h1'`) doesn't match real caption markup — task-001 already flagged Instagram's DOM as the most brittle/session-dependent of the three platform adapters; this is that risk materializing, not a surprise. `getUploaderName()` likely has the same problem (same brittleness, not yet confirmed live). | Low (non-blocking — capture/upload/download all work; only display metadata is affected) | Open | Needs live-DOM inspection of an actual Instagram post to find working selectors — best done together with a fix for `getUploaderName()` since they likely share a root cause. |
