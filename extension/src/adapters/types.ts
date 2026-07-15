export type UploaderType =
  | 'artist_channel'
  | 'label_channel'
  | 'reupload'
  | 'unknown';

export type SourcePlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'radio_stream'
  | 'generic'
  | 'manual_tab_capture';

export interface SampleMetadata {
  title: string;
  uploaderName: string;
  uploaderType?: UploaderType;
  uploadDate?: string;
  sourcePlatform: SourcePlatform;
  sourceUrl: string;
}

export interface SiteAdapter {
  /** Hostname + DOM signature check. Synchronous, no network/LLM calls. */
  detect(): boolean;

  /**
   * Returns the source node for the currently-playing media element this
   * adapter targets. Takes the caller's AudioContext because
   * createMediaElementSource must be called on the context that will drive
   * the rest of the capture graph — the adapter can't own its own context.
   * Throws if no eligible element is found (i.e. detect() would return
   * false, or the element disappeared between detect() and this call).
   */
  getAudioNode(audioContext: AudioContext): MediaElementAudioSourceNode;

  /**
   * The raw media element behind getAudioNode(), for the capture engine to
   * drive directly (seek/play/listen for the natural end) — needed to
   * default to capturing the full source rather than requiring a manual
   * stop. Same eligible-element lookup as getAudioNode(); throws under the
   * same conditions.
   */
  getMediaElement(): HTMLMediaElement;

  /** Best-effort metadata extraction. Omit fields the platform doesn't
   *  expose rather than guessing. */
  getMetadata(): SampleMetadata;
}
