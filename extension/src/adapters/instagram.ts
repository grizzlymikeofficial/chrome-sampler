import type { SampleMetadata, SiteAdapter } from './types';
import { getOrCreateSourceNode } from './shared-audio-node';

const INSTAGRAM_HOSTNAMES = new Set(['instagram.com', 'www.instagram.com']);

function findActiveVideoElement(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
  return videos.find((v) => !v.paused) ?? videos[0] ?? null;
}

function getCaptionText(): string {
  const el = document.querySelector<HTMLElement>('h1, article h1');
  return el?.textContent?.trim() ?? '';
}

function getUploaderName(): string {
  const el = document.querySelector<HTMLElement>('header a[role="link"]');
  return el?.textContent?.trim() ?? '';
}

export const instagramAdapter: SiteAdapter = {
  // Instagram's DOM is more session/auth-dependent and shifts more than
  // YouTube/TikTok's. Kept as a single synchronous check per task-001 —
  // no retry/mutation-observer polling layer here; brittleness in practice
  // is production feedback for architecture-notes.md, not this task's
  // problem to pre-solve.
  detect() {
    return INSTAGRAM_HOSTNAMES.has(location.hostname) && findActiveVideoElement() !== null;
  },

  getAudioNode(audioContext) {
    const video = findActiveVideoElement();
    if (!video) throw new Error('instagramAdapter: no eligible video element found');
    return getOrCreateSourceNode(audioContext, video);
  },

  getMediaElement() {
    const video = findActiveVideoElement();
    if (!video) throw new Error('instagramAdapter: no eligible video element found');
    return video;
  },

  getMetadata(): SampleMetadata {
    return {
      title: getCaptionText(),
      uploaderName: getUploaderName(),
      // Same caveat as TikTok: no reliable public artist/label signal.
      uploaderType: 'unknown',
      sourcePlatform: 'instagram',
      sourceUrl: location.href,
    };
  },
};
