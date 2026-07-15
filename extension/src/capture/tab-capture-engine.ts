import type { SampleMetadata } from '../adapters/types';
import type { CaptureHandle, CaptureResult } from './capture-engine';

// chrome.tabCapture is only available to extension pages (popup/background/
// offscreen) — never to content scripts, for security reasons. This module
// is imported by popup.ts only, bundled as a separate entry point from
// content-script.ts (see package.json's build script).
//
// This is the general-purpose fallback for anything the adapter pattern
// doesn't (or shouldn't have to) recognize: radio streams, arbitrary
// unrecognized audio, and — as a side effect, not the primary motivation —
// DRM-protected platforms, since capturing the tab's rendered output is
// the same "analog hole" mechanism already scoped for that case
// (prd-extension-client.md, "DRM-protected sources"). One mechanism, three
// use cases, deliberately not three separate ones.
//
// V0 limitation, flagged deliberately: this recording lives in the popup's
// own script context. Chrome extension popups close — destroying their JS
// context — on any outside click or loss of focus, so closing the popup
// mid-recording silently kills the capture. A persistent recorder would
// need a chrome.offscreen document behind the background service worker;
// not built here. Revisit if this proves too fragile in practice.
export function startTabCapture(tab: chrome.tabs.Tab): Promise<CaptureHandle> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
      if (chrome.runtime.lastError || !stream) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'tabCapture.capture returned no stream'));
        return;
      }

      // chrome.tabCapture mutes the tab's normal output once captured — by
      // design, so the capturing extension can decide what to do with the
      // audio. Confirmed live: without this, the user can't hear anything
      // while recording. Route a copy back to the popup's own speakers so
      // playback isn't silently cut, same as the adapter-based path already
      // does for in-page taps (shared-audio-node.ts's connect-to-destination
      // step).
      const audioContext = new AudioContext();
      audioContext.createMediaStreamSource(stream).connect(audioContext.destination);

      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      const metadata: SampleMetadata = {
        title: tab.title ?? '',
        uploaderName: '',
        sourcePlatform: 'manual_tab_capture',
        sourceUrl: tab.url ?? '',
      };

      let resolveResult: (value: CaptureResult) => void;
      const result = new Promise<CaptureResult>((res) => {
        resolveResult = res;
      });

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close();
        const blob = new Blob(chunks, { type: recorder.mimeType });
        resolveResult({ blob, metadata });
      };

      recorder.start();

      resolve({
        result,
        stop: () => {
          if (recorder.state !== 'inactive') recorder.stop();
        },
        // No known duration for a manual tab capture — always requires an
        // explicit stop(), same as radio streams in the adapter path.
        autoStops: false,
      });
    });
  });
}
