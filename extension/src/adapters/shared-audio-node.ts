// createMediaElementSource() can only be called once, ever, per DOM
// element — a second call on the same element throws InvalidStateError,
// even from a different AudioContext. Sites that recycle video elements
// across a feed (confirmed on TikTok during manual testing) will hand the
// same element back on a later capture, so every adapter must go through
// this cache instead of calling createMediaElementSource directly.
const sourceNodeCache = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
const connectedToDestination = new WeakSet<MediaElementAudioSourceNode>();

export function getOrCreateSourceNode(
  audioContext: AudioContext,
  element: HTMLMediaElement
): MediaElementAudioSourceNode {
  let node = sourceNodeCache.get(element);
  if (!node) {
    node = audioContext.createMediaElementSource(element);
    sourceNodeCache.set(element, node);
  }
  // Connect to destination at most once per node — tapping doesn't mute
  // normal playback, but reconnecting the same edge on every capture would
  // either no-op or (implementation-dependent) double the output.
  if (!connectedToDestination.has(node)) {
    node.connect(audioContext.destination);
    connectedToDestination.add(node);
  }
  return node;
}
