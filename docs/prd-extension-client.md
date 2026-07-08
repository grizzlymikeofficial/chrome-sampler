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

## Site recognition — explicitly non-agentic

This is a deterministic adapter pattern, not an AI agent. Each supported site
gets a small module implementing:

```ts
interface SiteAdapter {
  detect(): boolean;               // hostname + DOM signature check
  getAudioNode(): MediaStreamAudioSourceNode;
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

Unknown/unsupported sites still get the generic "capture audio" button; they
just don't get a one-click platform-specific shortcut or rich metadata.

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
5. Optional: "extract stems" button, shown only when the backend flags the
   capture as layered/multi-instrument music
6. Download button, always available once processing completes

## Explicitly out of scope for the client

- No public browsing/search of other users' samples (the DB is private,
  maintainer-only)
- No sharing/social features
