# Review 001 — Site Recognition Adapters

**Reviewing:** `feature/task-001-recognition-adapters`
**Against:** `docs/tasks/task-001-recognition-adapters.md`
**Reviewer session:** 2026-07-08, `review/task-001-recognition-adapters`

## Independently re-verified

- `npm run typecheck` — clean, re-run fresh (not taken on the Implementer's
  word). Matches the Implementer's STATUS.md claim.
- `npm test` — 5/5 passing, re-run fresh. Matches the Implementer's STATUS.md
  claim.
- STATUS.md entry for the Implementer session (2026-07-08-01:30) accurately
  describes what the diff does — no stale/optimistic self-reporting found.

## Acceptance criteria (`task-001`) — pass/fail

| Criterion | Result |
|---|---|
| Types match spec | PASS |
| `getAudioNode(audioContext)` returns `MediaElementAudioSourceNode` | PASS |
| One module per adapter, conforms to `SiteAdapter` | PASS |
| `registry.ts`/`getActiveAdapter()` ordering + null fallback | PASS |
| No network/LLM calls in `detect()` | PASS |
| No guessed/synthetic metadata fields | PASS |
| No AGPL dependency | PASS (dev-only: typescript, vitest, jsdom) |
| Unit tests cover `getActiveAdapter()` ordering | PASS (5 tests, see above) |
| **Manual test: `detect()` true/false on live pages** | **NOT PERFORMED — see below** |

## Manual-test criterion: could not be executed in this environment

Attempted using the URL provided
(`https://www.youtube.com/watch?v=grisBvgeY18`, "Famous 'Loon Garden' Sample
from E-mu Emulator II Sound Library") via `WebFetch`. This tool does a
static HTML fetch converted to markdown, summarized by a small model — it
does not execute JavaScript or render YouTube's SPA DOM, so it cannot run
the extension's actual content script or evaluate `document.querySelector`
against the live page. In practice the fetch returned mostly nav/footer
boilerplate and couldn't even surface the channel name.

This criterion needs a human loading the unpacked extension in a real
Chrome browser and visiting live pages on each platform — that's not
something a Reviewer session in this environment can substitute for.
**Flagging as blocked/unverified, not as a pass.**

## Findings for the Implementer

### 1. `youtube.ts` — `inferUploaderType()` verified-badge check is unscoped (confirmed bug, not just an unverified-selector risk)

**File:** `extension/src/adapters/youtube.ts:29`

```ts
if (document.querySelector('[aria-label="Verified"]')) return 'artist_channel';
```

This queries the entire document, not the channel-info panel for the video
actually being watched. A YouTube watch page's sidebar is full of
recommended-video cards, many showing a verified badge for *other*
channels. This selector matches the first verified badge anywhere on the
page.

**Failure scenario:** a video from a small, unverified creator, viewed
while at least one verified channel's video appears in the recommendations
sidebar (true on the large majority of watch pages) → `getMetadata()`
returns `uploaderType: 'artist_channel'` for a channel that is neither
verified nor artist-affiliated. This is a design-level bug, not a
selector-staleness issue — it would misfire even if the selector string is
exactly correct, because the *scope* is wrong, not just the *target*. It
feeds a wrong signal directly into Tier 4 copyright reasoning
(`prd-backend-pipeline.md`), which takes uploader-type signal as an input.

**Suggested fix (for the Implementer to decide/implement, not prescribed
here):** scope the verified-badge query to the primary channel/owner
container near the video player (e.g. the element also targeted by
`getChannelName()`'s selectors), not `document`-wide.

### 2. Same root cause, lower severity — `getChannelName()`'s selectors are also unscoped

**File:** `extension/src/adapters/youtube.ts:11-16`

`ytd-channel-name` is a component YouTube reuses in multiple places
(comments, suggested videos, live chat), so `document.querySelector(...)`
picking the *first* DOM match isn't guaranteed to be the primary uploader's
name. Lower severity than finding #1 because the primary channel-name panel
is typically early in the DOM for the watch page, so it's more likely (but
not guaranteed) to be right — worth the Implementer double-checking once
live-DOM verification (the blocked manual-test criterion) happens, rather
than a confirmed failure like #1.

## Cost/licensing/copyright-integrity checks (per `docs/agents/reviewer.md`)

- No new LLM/API calls introduced — N/A, this task is pure DOM inspection.
- No new runtime dependencies; devDependencies (typescript, vitest, jsdom)
  are not AGPL.
- No copyright-cascade code touched — N/A, this task doesn't reach that
  layer.

## Overall

**Not yet approved.** Remaining blocker:
1. Live-DOM manual verification of `detect()`/`getMetadata()` on real
   YouTube/TikTok/Instagram/radio-stream pages — genuinely can't be done in
   this environment; needs a human with a browser.

Finding #1 (unscoped verified-badge query) triaged by maintainer 2026-07-08
as non-blocking — tracked as `BUG-001` in `docs/bug-list.md` instead of
gating this task's closure. Everything else (types, registry logic, test
coverage, licensing, cost discipline) passes.
