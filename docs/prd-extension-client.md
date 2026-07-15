# PRD: Extension Client

## Scope

Everything that runs in the browser: capture, site detection, the capture
button UI, upload to backend, and the HITL surfaces the producer interacts
with directly. See `prd-hitl-review.md` for the detailed UI copy/logic of
each HITL moment — this doc covers the shell around them.

## Capture engine

- Uses the Web Audio API to tap the audio graph of any playing `<audio>` or
  `<video>` element via `MediaElementAudioSourceNode`, routed through a
  `MediaRecorder` to produce a high-quality file (prefer lossless/WAV at
  source sample rate; do not downsample on capture — quality decisions happen
  later, see the format-mismatch HITL flow).
- Capture is user-initiated only (explicit button press). No passive/background
  recording.

### Duration handling & clip selection

- If the source's known duration exceeds 60 seconds, show a non-blocking
  prompt recommending the user slice to a specific sub-range via a
  waveform/timestamp selector before capturing, targeting under 60 seconds.
  Never hard-block: the user can dismiss the prompt and capture the full
  length regardless of duration-- but if it is over 600 seconds, they will bipass the tagging functionality. Do not attempt to analyze any audio files that are over 10 minutes-- just force a download option & alert user that tagging cannot be processed for audio over 10 minutes long.
- Sources with indeterminate duration (live radio streams, `duration ===
  Infinity`) skip this specific prompt — there's nothing to slice against.
  Capture length for these is whatever the user's manual start/stop window
  covers.
- **New scope, not yet designed:** this requires a waveform/timestamp
  range-selection UI component that doesn't exist yet. Not specified further
  here — needs its own task spec once the capture-engine task is scoped. For V0 can use opensource framework like wavesurfer or another common framework.
- **Open question for whoever scopes the capture-engine task:** is the
  60-second/10-minute check measured against the source media element's
  total duration (`element.duration`), or against elapsed recording time
  once the user presses start? The maintainer's framing ("slice the waveform
  to a specific timestamp") implies the former — pre-selecting a range within
  a long source before recording — but this should be confirmed, not assumed,
  since it changes whether capture is "record the whole thing then trim" or
  "select a range, then record only that." Note from 7/14 - if the element is over 60-seconds, display UI for the full waveform and recommend user slices it to < 10 minute section. If the sliced section is > 10 minutes, skip tagging process and send file to direct download.

### DRM-protected sources (Netflix, Prime Video, etc.) -- Low priority for V0. Can skip if risk of blank audio.

- Widevine-protected content renders **silent** audio through the Web Audio
  graph by design — `MediaElementAudioSourceNode` will not produce real audio
  from these platforms no matter how the site adapter is written. This is a
  browser-level anti-circumvention behavior, not a bug to route around with
  a cleverer adapter.
- **Built, as of 2026-07-14 — not a separate DRM-specific mode.** What was
  scoped here as a second capture mode turned out to be the same mechanism
  as the general-purpose manual-record fallback below (extension popup +
  `chrome.tabCapture`): tap the tab's rendered output instead of the page's
  audio graph. One implementation, not two — DRM-protected platforms get
  audio capture "for free" as a side effect of the popup fallback existing,
  not from bespoke DRM-handling code. Mechanically this is the "analog
  hole" — the same thing as a producer routing system/loopback audio into a
  DAW to sample it — not decryption, stream manipulation, or circumvention
  of the DRM itself. The encrypted content is never touched; only the
  already-decrypted, already-rendered output is captured.
- That framing likely weakens the DMCA anti-circumvention question (17 U.S.C.
  § 1201) — there's no technological protection measure being bypassed. It
  does **not** resolve a separate question: most streaming platforms' Terms
  of Service explicitly prohibit recording/downloading regardless of
  mechanism, which is a contract-risk question independent of circumvention
  law (account bans, ToS breach exposure).
- **Project status note:** this extension is currently a local-only
  research/case-study prototype, not distributed publicly. Given that, and
  given the analog-hole framing above, local prototyping of tab/system-audio
  capture is in scope now without waiting on formal legal review — but
  **full ToS/legal review is a hard gate before any public distribution**
  (see revised open decision in `prd-overview.md`). This distinction does
  not extend to actual DRM defeat: extracting decryption keys, stripping
  protection from the manifest/segments, or any CDM-bypass approach that
  touches the encrypted stream itself is out of scope categorically,
  regardless of project stage — that's a materially different (and narrowly
  exempted, if at all) legal category from recording rendered output, and
  the tab-capture approach doesn't need it anyway.

## Site recognition — explicitly non-agentic

This is a deterministic adapter pattern, not an AI agent. Each supported site
gets a small module implementing:

```ts
interface SiteAdapter {
  detect(): boolean;               // hostname + DOM signature check
  // Takes the caller's AudioContext — createMediaElementSource() must run
  // on the same context that drives the rest of the capture graph.
  // (Corrected from the original sketch during task-001's implementation:
  // MediaStreamAudioSourceNode wraps a MediaStream — mic/webcam input, not
  // an existing <audio>/<video> element's own output.)
  getAudioNode(audioContext: AudioContext): MediaElementAudioSourceNode;
  // The raw element behind getAudioNode() — added so the capture engine can
  // seek/play/listen for the natural end and default to capturing the full
  // source, rather than requiring a manual stop for everything.
  getMediaElement(): HTMLMediaElement;
  getMetadata(): {
    title: string;
    uploaderName: string;
    uploaderType?: 'artist_channel' | 'label_channel' | 'reupload' | 'unknown';
    uploadDate?: string;
    sourcePlatform: string;
    sourceUrl: string;
  };
}
```

Launch adapters: YouTube, TikTok, Instagram, one generic radio-stream adapter
(keys off `<audio>` tags with `src` pointing to a streaming endpoint), and a
fallback generic adapter for anything else with a playing media element.

**V0 design change, 2026-07-14 — manual popup fallback instead of solving
in-page detection for everything.** Reliably recognizing radio streams and
arbitrary audio pages via DOM inspection turned out not to be worth solving
for V0. Instead: when no adapter's `detect()` matches (or the producer just
prefers it), the extension's own toolbar-icon **popup** provides a simple,
page-agnostic "Record Audio" / "Stop & Upload" button using
`chrome.tabCapture` — capturing whatever the current tab is outputting,
independent of any DOM element or adapter. No in-page UI, no per-site
detection logic required. This also means:
- The `radio-stream` and `generic` adapters remain as-is (still useful when
  they *do* match — no in-page button click needed) but are no longer the
  only path for unrecognized audio; deprioritizing further investment in
  their detection heuristics is reasonable now that the popup covers the
  same need more robustly.
- Manual popup capture always requires an explicit stop — there's no way to
  know "the full duration" without a recognized element, same as the
  radio-stream adapter's existing behavior.
- **Known V0 limitation, not a bug:** a Chrome extension popup's JS context
  is destroyed when the popup loses focus (any outside click, tab switch,
  etc.), which silently ends an in-progress recording. A persistent
  recorder would need a `chrome.offscreen` document behind the background
  service worker — not built for V0; revisit if this proves too fragile in
  practice.
- DRM-protected platforms (Netflix, Prime Video, etc.) are still not part
  of the adapter pattern (see "DRM-protected sources" above), and still
  fall through to the generic adapter's `detect()` on the page like any
  other site — but now get usable capture anyway via the popup fallback,
  since `chrome.tabCapture` doesn't care whether the underlying video is
  DRM-protected.

**Why non-agentic:** site fingerprinting is a fixed, enumerable rule set. An
LLM call here would add latency and cost for zero judgment benefit — there's
nothing ambiguous about "is this youtube.com."

## Metadata extraction for downstream context

The adapter should extract as much of the following as the platform exposes,
since the copyright cascade's Tier 4 (see `prd-backend-pipeline.md`) depends
on it:

- Uploader type signal (verified badge, "Topic" channel convention, sub count
  tier, label-affiliated account patterns)
- Upload date (for public-domain/age reasoning — signal only, never a hard rule)
- Platform (radio streams, TikTok clips, and YouTube uploads carry different
  base rates of commercial content)

## Post-capture flow (client side)

1. Capture completes -> file + metadata sent to backend pipeline
2. Client polls/subscribes for pipeline status (recognition is instant;
   copyright + tagging + optional stem extraction run asynchronously)
3. If copyright check blocks -> user sees a plain "not available" state, no
   detail on why (avoid exposing detection logic)
4. If cleared -> tagging results render, with the disambiguation prompt
   surfaced inline if triggered (see `prd-hitl-review.md`)
5. "Extract Stems" button — **always available**, not gated behind the
   multi-instrument flag. When the flag fires (see `prd-backend-pipeline.md`
   section 4, `prd-hitl-review.md` touchpoint 7), an inline suggestion
   appears alongside it ("Multiple instruments detected — would you like to
   extract stems?"); the button itself works regardless, so a producer can
   extract stems from any sample on their own judgment even when the flag
   didn't fire.
6. Download button, always available once processing completes

## Explicitly out of scope for the client

- No public browsing/search of other users' samples (the DB is private,
  maintainer-only)
- No sharing/social features
