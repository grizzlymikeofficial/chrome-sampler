# Task 001 — Site Recognition Adapters

**Status:** ready for implementer
**Depends on:** nothing (first extension-client task)
**Blocks:** capture engine wiring (needs `getAudioNode()`), backend upload
(needs `getMetadata()` shape), disambiguation/naming context (needs uploader
signal), Tier 4 copyright context (needs uploader signal + upload date)

## Scope

Implement the non-agentic site-recognition layer described in
`docs/prd-extension-client.md` ("Site recognition — explicitly non-agentic"):
a `SiteAdapter` per supported platform, plus the dispatcher that picks the
right adapter for the current page. This task produces the adapters and
their selection logic only — it does not wire them into the capture button,
the `MediaRecorder` pipeline, or the upload flow. Those are separate tasks
that will consume the interfaces defined here.

**Why non-agentic (from the PRD, restated so this doesn't get "improved"
later):** site fingerprinting is a fixed, enumerable rule set — hostname +
DOM signature checks. Do not introduce an LLM call, a remote config fetch,
or any heuristic scoring here. If a future adapter's detection genuinely
can't be expressed as a deterministic check, that's a signal to escalate to
the architect, not to reach for a model call.

## Interfaces

### `SiteAdapter` (as specified in the PRD — do not rename fields)

```ts
// extension/src/adapters/types.ts

export type UploaderType =
  | 'artist_channel'
  | 'label_channel'
  | 'reupload'
  | 'unknown';

export interface SampleMetadata {
  title: string;
  uploaderName: string;
  uploaderType?: UploaderType;
  uploadDate?: string;       // ISO 8601 if the platform exposes it, else omit
  sourcePlatform: string;    // stable slug, see SourcePlatform below
  sourceUrl: string;
}

export type SourcePlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'radio_stream'
  | 'generic';

export interface SiteAdapter {
  /** Hostname + DOM signature check. Must be cheap and synchronous —
   *  called on every adapter, on every page, via the registry below. */
  detect(): boolean;

  /** Returns the source node for the currently-playing media element this
   *  adapter targets. Takes the caller's AudioContext because
   *  createMediaElementSource() must be called on the same context that
   *  will drive the rest of the capture graph — an adapter can't own its
   *  own context. Caller (capture engine, separate task) still owns
   *  AudioContext lifecycle and MediaRecorder wiring. Throws if called
   *  before detect() has returned true, or if no eligible element is
   *  currently playing.
   *  (Corrected from an earlier no-argument version during task-001's
   *  implementation — see STATUS.md, Implementer session
   *  2026-07-08-01:30.) */
  getAudioNode(audioContext: AudioContext): MediaElementAudioSourceNode;

  /** Best-effort metadata extraction. Fields the platform doesn't expose
   *  (or exposes ambiguously) should be omitted, not guessed. */
  getMetadata(): SampleMetadata;
}
```

Note: the PRD's interface sketch used `MediaStreamAudioSourceNode` for
`getAudioNode()`'s return type; that's the wrong Web Audio type for tapping
an existing `<audio>`/`<video>` element (`MediaStreamAudioSourceNode` wraps a
`MediaStream`, e.g. mic/webcam input). Tapping a media element's own output
uses `MediaElementAudioSourceNode`, created via
`audioContext.createMediaElementSource(element)`. Corrected above — flagging
here per protocol since it's a deviation from the PRD text, not a silent
change.

### Adapter registry / dispatcher

Not explicitly specified in the PRD but required for the capture-button task
to consume a single entry point instead of re-implementing selection order.

```ts
// extension/src/adapters/registry.ts

import { SiteAdapter } from './types';

/**
 * Returns the first adapter whose detect() returns true, checked in the
 * order the array is constructed in. Order matters: platform-specific
 * adapters must be checked before the generic fallback, and generic
 * radio-stream before generic fallback (see ordering rule below).
 * Returns null only if no adapter (including generic fallback) matches —
 * in practice this should be unreachable, since the generic fallback's
 * detect() should match any page with a playing media element.
 */
export function getActiveAdapter(): SiteAdapter | null;
```

Ordering rule for the concrete list passed into this function: YouTube →
TikTok → Instagram → generic radio-stream → generic fallback. Radio-stream
must be checked before generic fallback because both may see a bare
`<audio>` tag; radio-stream's `detect()` narrows on `src` pointing to a
streaming endpoint (see below), and anything that doesn't match that narrower
check should fall through to generic.

## Adapters to implement

One module per adapter under `extension/src/adapters/`, each exporting a
`SiteAdapter`-conforming object or factory:

### 1. `youtube.ts`
- `detect()`: hostname is `youtube.com`/`www.youtube.com`/`m.youtube.com`
  (not `music.youtube.com` — out of scope for this task, flag as a follow-up
  if the maintainer wants it) AND the page has a `video.html5-main-video`
  element (or current equivalent — verify against live DOM, YouTube's
  internal class names shift).
- `getAudioNode()`: source the `<video>` element found above.
- `getMetadata()`:
  - `title`: video title element text
  - `uploaderName`: channel name text
  - `uploaderType`: derive from what's actually present in the DOM —
    verified-badge presence → weight toward `label_channel`/`artist_channel`
    per channel convention signals (e.g. "- Topic" suffix on
    auto-generated channels is a strong `label_channel`/reupload signal);
    otherwise `unknown`. Do not invent a confidence score; this is a coarse
    categorical signal per the PRD, consumed later by Tier 4 as one input
    among several, not a standalone judgment.
  - `uploadDate`: from the video's published-date metadata if present in DOM
    or page metadata tags; omit if not confidently parseable.
  - `sourcePlatform`: `'youtube'`
  - `sourceUrl`: `location.href`, stripped of tracking query params
    (e.g. `si=`) — see boundary note below.

### 2. `tiktok.ts`
- `detect()`: hostname is `tiktok.com`/`www.tiktok.com` AND a video player
  element is present on the page (feed or single-video view — both should
  work; don't assume single-video URL shape only).
- `getAudioNode()`: source the active `<video>` element.
- `getMetadata()`:
  - `title`: caption/description text if present
  - `uploaderName`: creator handle
  - `uploaderType`: TikTok doesn't expose a clean channel-type taxonomy the
    way YouTube does. Default to `'unknown'` unless a verified-badge
    indicator is present in DOM, in which case still `'unknown'` for now —
    do not invent a mapping from "verified" to `artist_channel` vs.
    `label_channel` without a real signal to distinguish them (see open
    question below).
  - `uploadDate`: from post metadata if present; omit otherwise.
  - `sourcePlatform`: `'tiktok'`
  - `sourceUrl`: canonical video URL if derivable, else `location.href`.

### 3. `instagram.ts`
- `detect()`: hostname is `instagram.com`/`www.instagram.com` AND a
  Reels/video player element is present.
- `getAudioNode()`: source the active `<video>` element.
- `getMetadata()`: same shape and same `uploaderType` caveat as TikTok —
  Instagram's public DOM doesn't expose a reliable label/artist distinction
  either. Default `'unknown'`.
- **Known risk, not this task's problem to solve:** Instagram's DOM is
  authenticated-session-dependent and changes more aggressively than
  YouTube/TikTok's. If detect() proves too brittle in practice, that's
  reviewer/production feedback for architecture-notes.md, not something to
  over-engineer against speculatively now (e.g. no retry/mutation-observer
  polling layer in this task — keep detect() a single synchronous check).

### 4. `radio-stream.ts` (generic radio-stream adapter)
- `detect()`: page has an `<audio>` element whose `src` (or active `<source>`
  child) points to a streaming endpoint. Concretely: URL has no typical file
  extension (`.mp3`, `.wav`, etc.) and/or the element is playing an
  indefinite-duration stream (`duration === Infinity` is the standard signal
  for a live stream in the HTML media spec — prefer this over URL-pattern
  guessing where available, since it's a real signal rather than a heuristic
  on URL shape).
- `getAudioNode()`: source that `<audio>` element.
- `getMetadata()`:
  - `title`: station name / now-playing text if the page exposes it (varies
    widely by station site — best-effort, may often be omitted)
  - `uploaderName`: station name if distinguishable from title, else same
    value
  - `uploaderType`: always `'unknown'` — this signal doesn't map to radio
  - `uploadDate`: omit always (streams have no upload date)
  - `sourcePlatform`: `'radio_stream'`
  - `sourceUrl`: `location.href`

### 5. `generic.ts` (fallback)
- `detect()`: always returns `true` if any `<audio>` or `<video>` element on
  the page is currently playing (`!element.paused`) or has played
  (`element.currentTime > 0`) — check the PRD's capture-engine assumptions
  before finalizing this; if the capture task expects "currently playing"
  strictly, use `!paused` only. **Flag this precise condition to whoever
  picks up the capture-engine task rather than guessing** — it determines
  whether a paused-but-loaded video is capturable.
- `getAudioNode()`: source whichever element `detect()` found.
- `getMetadata()`:
  - `title`: `document.title`
  - `uploaderName`: `''` (no signal)
  - `uploaderType`: omit
  - `uploadDate`: omit
  - `sourcePlatform`: `'generic'`
  - `sourceUrl`: `location.href`

## Explicit boundaries — not in scope for this task

- No `MediaRecorder` setup, no `AudioContext` lifecycle management, no
  capture-button UI. This task ends at handing back a `MediaElementAudioSourceNode`.
- No upload/serialization of `SampleMetadata` to the backend — that's the
  upload-flow task. This task just needs to produce the object.
- No persistence of "which adapter matched" across page navigations
  (SPA route changes on YouTube/TikTok/Instagram) — if the capture-engine
  task needs adapter re-detection on client-side navigation, that's a
  wiring concern for that task to call `getActiveAdapter()` again, not
  something this task's adapters need to observe themselves.
- No handling of `music.youtube.com`, Spotify Web Player, SoundCloud, or any
  platform not named in the PRD's launch list. If the maintainer wants these,
  that's a new task, not scope creep on this one.
- No handling of DRM-protected streaming platforms (Netflix, Prime Video,
  etc.) — these can't use the `SiteAdapter`/`MediaElementAudioSourceNode`
  pattern at all, since Widevine-protected content renders silent audio
  through the Web Audio graph by design, regardless of adapter logic.
  Maintainer has directed a future tab/system-audio capture engine for these
  (see `prd-overview.md` open decisions). Local prototyping of that capture
  mode is in scope for a future task without waiting on legal review (this
  is currently a local-only research/case-study project); full legal review
  is a pre-public-distribution gate, not a pre-prototyping one. Still out of
  scope for *this* task regardless — it's a distinct capture mechanism, not
  an adapter.
- URL query-param stripping (tracking params like YouTube's `si=`) should be
  minimal and platform-specific, not a general URL-canonicalization utility
  — don't build a generic sanitizer for a problem that's really "strip one
  or two known params per platform."

## Open questions for the maintainer (do not resolve unilaterally)

1. **TikTok/Instagram `uploaderType`**: neither platform's public DOM exposes
   a clean artist-vs-label distinction the way YouTube's "- Topic" convention
   does. Shipping both as permanently `'unknown'` means Tier 4 copyright
   reasoning gets a weaker signal for two of the four launch platforms. Is
   `'unknown'` acceptable for launch, or is there a heuristic (follower count
   tier, bio-link patterns) worth the added DOM-scraping surface? This is a
   cost/quality tradeoff (`prd-overview.md` constraint #3) — more scraping
   surface means more brittle adapters for a signal that's "one input among
   several" downstream, not a standalone gate.
2. **ToS review status**: `prd-overview.md`'s open-decisions list already
   flags "legal review of capture behavior against target platforms' ToS"
   as unresolved. This task makes that concrete — these adapters actively
   parse each platform's DOM for uploader/title metadata, not just tap
   audio. Confirming whether that's covered by the existing open item or
   needs separate legal sign-off before an implementer starts scraping
   Instagram specifically (the most session/auth-sensitive of the four) is
   a maintainer call, not an architect or implementer call.

## Acceptance criteria (for reviewer)

- [ ] `SiteAdapter`, `SampleMetadata`, `UploaderType`, `SourcePlatform` types
      exist in `extension/src/adapters/types.ts` matching the shapes above.
- [ ] `getAudioNode()` return type is `MediaElementAudioSourceNode`, not
      `MediaStreamAudioSourceNode` (see corrected-interface note above).
- [ ] One module per adapter: `youtube.ts`, `tiktok.ts`, `instagram.ts`,
      `radio-stream.ts`, `generic.ts`, each conforming to `SiteAdapter`.
- [ ] `registry.ts` exports `getActiveAdapter()`, checks adapters in the
      documented order (platform-specific → radio-stream → generic), and
      only returns `null` if literally nothing matches.
- [ ] No adapter's `detect()` makes a network call, reads remote config, or
      calls an LLM/remote API — synchronous DOM/hostname checks only, per
      the PRD's "explicitly non-agentic" framing.
- [ ] Fields the platform doesn't expose are omitted from `getMetadata()`
      output, never filled with a guessed/synthetic value (e.g. no fake
      `uploadDate`, no invented `uploaderType`).
- [ ] Manual test: each adapter's `detect()` correctly returns `true` on a
      live page of its platform and `false` when tested against at least
      one other adapter's platform (i.e. YouTube's adapter doesn't
      false-positive on TikTok).
- [ ] No AGPL dependency introduced (this task shouldn't need any audio
      library at all — it's DOM inspection only — but flag it per
      `CLAUDE.md` constraint #4 if that assumption turns out wrong).
- [ ] Unit tests cover `getActiveAdapter()`'s ordering logic with mocked
      `detect()` results (doesn't require real DOM fixtures for this part).

## Follow-up tasks this unblocks

- Capture engine (`MediaRecorder` wiring against `getAudioNode()`)
- Upload-flow task (serializing `SampleMetadata` to the backend, mapping
  camelCase client fields to the snake_case `Sample` DB fields in
  `prd-database-schema.md`)
- `music.youtube.com` / additional platform adapters, if the maintainer
  decides to expand launch scope (open question, not assumed here)
- Tab/system-audio capture engine for DRM-protected platforms (Netflix,
  Prime Video) — separate capture mechanism from the `SiteAdapter` pattern,
  pending legal review (see `prd-overview.md` open decisions)
- Waveform/timestamp range-selection UI for the duration-based capture
  prompt (see `prd-extension-client.md`, "Duration handling & clip
  selection") — not yet designed
