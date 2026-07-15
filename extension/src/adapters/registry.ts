import type { SiteAdapter } from './types';
import { youtubeAdapter } from './youtube';
import { tiktokAdapter } from './tiktok';
import { instagramAdapter } from './instagram';
import { radioStreamAdapter } from './radio-stream';
import { genericAdapter } from './generic';

// Order matters: platform-specific adapters before the generic fallback,
// and radio-stream before generic since both can match a bare <audio> tag
// (radio-stream's detect() narrows on stream-vs-file signals; anything that
// doesn't match falls through to generic).
export const ADAPTERS: SiteAdapter[] = [
  youtubeAdapter,
  tiktokAdapter,
  instagramAdapter,
  radioStreamAdapter,
  genericAdapter,
];

/**
 * Returns the first adapter whose detect() returns true, checked in order.
 * Accepts an explicit adapter list (defaulting to the real ADAPTERS) so
 * callers/tests can inject a fake list without needing live DOM fixtures.
 */
export function getActiveAdapter(adapters: SiteAdapter[] = ADAPTERS): SiteAdapter | null {
  return adapters.find((adapter) => adapter.detect()) ?? null;
}
