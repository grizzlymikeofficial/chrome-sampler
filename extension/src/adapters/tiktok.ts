import type { SampleMetadata, SiteAdapter } from './types';
import { getOrCreateSourceNode } from './shared-audio-node';

const TIKTOK_HOSTNAMES = new Set(['tiktok.com', 'www.tiktok.com']);

function findActiveVideoElement(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
  return videos.find((v) => !v.paused) ?? videos[0] ?? null;
}

function getCaptionText(): string {
  const el = document.querySelector<HTMLElement>(
    '[data-e2e="browse-video-desc"], [data-e2e="video-desc"]'
  );
  return el?.textContent?.trim() ?? '';
}

function getCreatorHandle(): string {
  const el = document.querySelector<HTMLElement>(
    '[data-e2e="browse-username"], [data-e2e="video-author-uniqueid"]'
  );
  return el?.textContent?.trim() ?? '';
}

function getCanonicalUrl(): string {
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  return canonical?.href || location.href;
}

export const tiktokAdapter: SiteAdapter = {
  detect() {
    return TIKTOK_HOSTNAMES.has(location.hostname) && findActiveVideoElement() !== null;
  },

  getAudioNode(audioContext) {
    const video = findActiveVideoElement();
    if (!video) throw new Error('tiktokAdapter: no eligible video element found');
    return getOrCreateSourceNode(audioContext, video);
  },

  getMediaElement() {
    const video = findActiveVideoElement();
    if (!video) throw new Error('tiktokAdapter: no eligible video element found');
    return video;
  },

  getMetadata(): SampleMetadata {
    return {
      title: getCaptionText(),
      uploaderName: getCreatorHandle(),
      // TikTok's public DOM has no clean artist/label taxonomy — default
      // 'unknown' rather than inventing a mapping from "verified" to a
      // specific type (see task-001 open question on this).
      uploaderType: 'unknown',
      sourcePlatform: 'tiktok',
      sourceUrl: getCanonicalUrl(),
    };
  },
};
