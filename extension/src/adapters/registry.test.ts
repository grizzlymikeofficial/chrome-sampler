import { describe, expect, it, vi } from 'vitest';
import { getActiveAdapter } from './registry';
import type { SiteAdapter } from './types';

function fakeAdapter(matches: boolean, onDetect?: () => void): SiteAdapter {
  return {
    detect: vi.fn(() => {
      onDetect?.();
      return matches;
    }),
    getAudioNode: vi.fn(),
    getMediaElement: vi.fn(),
    getMetadata: vi.fn(),
  };
}

describe('getActiveAdapter', () => {
  it('returns the first matching adapter in the given order', () => {
    const first = fakeAdapter(false);
    const second = fakeAdapter(true);
    const third = fakeAdapter(true);

    expect(getActiveAdapter([first, second, third])).toBe(second);
  });

  it('stops checking once a match is found', () => {
    const first = fakeAdapter(false);
    const second = fakeAdapter(true);
    const third = fakeAdapter(true);

    getActiveAdapter([first, second, third]);

    expect(first.detect).toHaveBeenCalledTimes(1);
    expect(second.detect).toHaveBeenCalledTimes(1);
    expect(third.detect).not.toHaveBeenCalled();
  });

  it('returns null when no adapter matches', () => {
    const adapters = [fakeAdapter(false), fakeAdapter(false)];
    expect(getActiveAdapter(adapters)).toBeNull();
  });

  it('checks adapters strictly in array order', () => {
    const order: string[] = [];
    const adapters: SiteAdapter[] = [
      fakeAdapter(false, () => order.push('youtube')),
      fakeAdapter(false, () => order.push('radio_stream')),
      fakeAdapter(true, () => order.push('generic')),
    ];

    getActiveAdapter(adapters);

    expect(order).toEqual(['youtube', 'radio_stream', 'generic']);
  });

  it('defaults to the real ADAPTERS list when none is passed', () => {
    // Just verifies the default param wires up without throwing outside a
    // DOM environment providing document/location — real detect() calls
    // are exercised via the default list, not asserted on here.
    expect(() => getActiveAdapter()).not.toThrow();
  });
});
