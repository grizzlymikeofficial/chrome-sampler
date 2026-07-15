import { getActiveAdapter } from '../adapters/registry';
import type { SampleMetadata } from '../adapters/types';

export interface CaptureResult {
  blob: Blob;
  metadata: SampleMetadata;
}

export interface CaptureHandle {
  /** Resolves when capture finishes — automatically at the source's
   *  natural end (autoStops === true) or when stop() is called. */
  result: Promise<CaptureResult>;
  /** Ends capture early. No-op if it has already finished. */
  stop(): void;
  /** Whether this capture will finish on its own because the source has a
   *  known, finite duration (default: capture the whole thing) — false for
   *  indeterminate-duration sources (live radio streams), which need an
   *  explicit stop() call. The UI uses this to decide whether to show a
   *  manual stop control. */
  autoStops: boolean;
}

// createMediaElementSource()'s per-element restriction (see
// shared-audio-node.ts) means the AudioContext that owns those cached nodes
// must persist too — closing and recreating it per capture, like this used
// to, would strand every cached node from a prior capture. One shared
// context for the page's lifetime instead.
let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext();
  }
  if (sharedAudioContext.state === 'suspended') {
    void sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

// PRD (prd-extension-client.md) prefers lossless/WAV at source sample rate
// and says not to downsample on capture. MediaRecorder in Chrome doesn't
// support a raw WAV/PCM output mimeType — only compressed codecs
// (effectively webm/opus in practice). Using MediaRecorder's default here
// and flagging the gap rather than silently treating this as "close enough"
// to the PRD's stated preference.
export function startCapture(): CaptureHandle {
  const adapter = getActiveAdapter();
  if (!adapter) throw new Error('No site adapter matched this page');

  const audioContext = getSharedAudioContext();
  const element = adapter.getMediaElement();
  const sourceNode = adapter.getAudioNode(audioContext);
  const destination = audioContext.createMediaStreamDestination();
  sourceNode.connect(destination);

  const recorder = new MediaRecorder(destination.stream);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const metadata = adapter.getMetadata();
  // Known, finite duration (YouTube/TikTok/Instagram videos) -> capture the
  // whole thing by default. Unknown/infinite duration (live radio streams)
  // -> fall back to manual start/stop, since there's no "full length" to
  // capture toward.
  const autoStops = Number.isFinite(element.duration) && element.duration > 0;

  let resolveResult: (value: CaptureResult) => void;
  const result = new Promise<CaptureResult>((resolve) => {
    resolveResult = resolve;
  });

  function stop() {
    element.removeEventListener('ended', stop);
    sourceNode.disconnect(destination);
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  }

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType });
    resolveResult({ blob, metadata });
  };

  if (autoStops) {
    element.currentTime = 0;
    element.addEventListener('ended', stop, { once: true });
    element.play().catch((err) => {
      console.error('[sample-lib] failed to auto-play for full capture', err);
    });
  }

  recorder.start();

  return { result, stop, autoStops };
}
