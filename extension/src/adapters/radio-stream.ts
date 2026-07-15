import type { SampleMetadata, SiteAdapter } from './types';
import { getOrCreateSourceNode } from './shared-audio-node';

const KNOWN_FILE_EXTENSIONS = /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i;

function isStream(audio: HTMLAudioElement): boolean {
  const src = audio.currentSrc || audio.src;
  if (!src) return false;
  // duration === Infinity is the HTML media spec's own signal for a live
  // stream — prefer it over URL-pattern guessing wherever the browser
  // exposes it; fall back to extension sniffing only when duration isn't
  // known yet (e.g. metadata hasn't loaded).
  if (audio.duration === Infinity) return true;
  return !KNOWN_FILE_EXTENSIONS.test(src);
}

function findStreamElement(): HTMLAudioElement | null {
  const audios = Array.from(document.querySelectorAll<HTMLAudioElement>('audio'));
  return audios.find(isStream) ?? null;
}

function getStationName(): string {
  const el = document.querySelector<HTMLElement>(
    '[class*="station-name"], [class*="now-playing"], [class*="stream-title"]'
  );
  return el?.textContent?.trim() || document.title;
}

export const radioStreamAdapter: SiteAdapter = {
  detect() {
    return findStreamElement() !== null;
  },

  getAudioNode(audioContext) {
    const audio = findStreamElement();
    if (!audio) throw new Error('radioStreamAdapter: no eligible stream element found');
    return getOrCreateSourceNode(audioContext, audio);
  },

  getMediaElement() {
    const audio = findStreamElement();
    if (!audio) throw new Error('radioStreamAdapter: no eligible stream element found');
    return audio;
  },

  getMetadata(): SampleMetadata {
    const stationName = getStationName();
    return {
      title: stationName,
      uploaderName: stationName,
      uploaderType: 'unknown',
      // Streams have no upload date — uploadDate intentionally omitted.
      sourcePlatform: 'radio_stream',
      sourceUrl: location.href,
    };
  },
};
