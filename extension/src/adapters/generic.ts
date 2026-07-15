import type { SampleMetadata, SiteAdapter } from './types';
import { getOrCreateSourceNode } from './shared-audio-node';

// Open question flagged in task-001 for the capture-engine task: whether
// "eligible" should mean strictly !paused, or also include elements that
// have played but are currently paused (currentTime > 0). Kept permissive
// here; narrow it if the capture engine's assumptions require strict
// "currently playing" semantics.
function findEligibleElement(): HTMLMediaElement | null {
  const elements = Array.from(document.querySelectorAll<HTMLMediaElement>('audio, video'));
  return elements.find((el) => !el.paused || el.currentTime > 0) ?? null;
}

export const genericAdapter: SiteAdapter = {
  detect() {
    return findEligibleElement() !== null;
  },

  getAudioNode(audioContext) {
    const element = findEligibleElement();
    if (!element) throw new Error('genericAdapter: no eligible media element found');
    return getOrCreateSourceNode(audioContext, element);
  },

  getMediaElement() {
    const element = findEligibleElement();
    if (!element) throw new Error('genericAdapter: no eligible media element found');
    return element;
  },

  getMetadata(): SampleMetadata {
    return {
      title: document.title,
      uploaderName: '',
      sourcePlatform: 'generic',
      sourceUrl: location.href,
    };
  },
};
