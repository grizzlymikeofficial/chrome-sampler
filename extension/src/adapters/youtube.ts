import type { SampleMetadata, SiteAdapter, UploaderType } from './types';
import { getOrCreateSourceNode } from './shared-audio-node';

const YOUTUBE_HOSTNAMES = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

// YouTube's internal class names shift over time — verify against live DOM
// before relying on these (see STATUS.md / task-001 confidence note).
function findVideoElement(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('video.html5-main-video');
}

function getChannelName(): string {
  const el = document.querySelector<HTMLElement>(
    'ytd-channel-name #text, #channel-name #text, #upload-info #channel-name'
  );
  return el?.textContent?.trim() ?? '';
}

function getVideoTitle(): string {
  const el = document.querySelector<HTMLElement>(
    'h1.ytd-watch-metadata yt-formatted-string, #title h1'
  );
  return el?.textContent?.trim() || document.title;
}

// Coarse categorical signal only — one input among several for Tier 4
// downstream, not a standalone judgment. Never invent a confidence score.
function inferUploaderType(channelName: string): UploaderType {
  if (/-\s*topic$/i.test(channelName)) return 'label_channel';
  if (document.querySelector('[aria-label="Verified"]')) return 'artist_channel';
  return 'unknown';
}

function getUploadDate(): string | undefined {
  const meta = document.querySelector<HTMLMetaElement>('meta[itemprop="datePublished"]');
  if (!meta?.content) return undefined;
  const parsed = new Date(meta.content);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function stripTrackingParams(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete('si');
  return parsed.toString();
}

export const youtubeAdapter: SiteAdapter = {
  detect() {
    return YOUTUBE_HOSTNAMES.has(location.hostname) && findVideoElement() !== null;
  },

  getAudioNode(audioContext) {
    const video = findVideoElement();
    if (!video) throw new Error('youtubeAdapter: no eligible video element found');
    return getOrCreateSourceNode(audioContext, video);
  },

  getMediaElement() {
    const video = findVideoElement();
    if (!video) throw new Error('youtubeAdapter: no eligible video element found');
    return video;
  },

  getMetadata(): SampleMetadata {
    const uploaderName = getChannelName();
    return {
      title: getVideoTitle(),
      uploaderName,
      uploaderType: inferUploaderType(uploaderName),
      uploadDate: getUploadDate(),
      sourcePlatform: 'youtube',
      sourceUrl: stripTrackingParams(location.href),
    };
  },
};
