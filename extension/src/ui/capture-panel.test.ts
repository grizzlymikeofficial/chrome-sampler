import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mountCapturePanel } from './capture-panel';
import type { PipelineClient } from '../pipeline/client';
import type { UploadResult, Tags } from '../pipeline/types';
import type { CaptureHandle } from '../capture/capture-engine';
import type { SampleMetadata } from '../adapters/types';

function fakeMetadata(): SampleMetadata {
  return {
    title: 'Test Capture',
    uploaderName: 'Test Uploader',
    sourcePlatform: 'generic',
    sourceUrl: 'https://example.com',
  };
}

function fakeTags(overrides: Partial<Tags> = {}): Tags {
  return {
    bpm: 120,
    bpmConfidence: 1,
    key: 'C minor',
    keyConfidence: 1,
    type: 'loop',
    category: 'kick',
    genre: 'trap',
    genreConfidence: 0.92,
    mood: 'dark ambient',
    moodConfidence: 0.9,
    ...overrides,
  };
}

function fakeResult(overrides: Partial<UploadResult> = {}): UploadResult {
  return {
    id: 'abc123',
    copyrightStatus: 'cleared_tier1',
    tags: fakeTags(),
    generatedName: 'stub sample — kick, 120bpm, Cmin',
    downloadUrl: '/download/abc123',
    ...overrides,
  };
}

function fakeCaptureHandle(autoStops = false): CaptureHandle {
  let resolveResult: (value: { blob: Blob; metadata: SampleMetadata }) => void;
  const result = new Promise<{ blob: Blob; metadata: SampleMetadata }>((resolve) => {
    resolveResult = resolve;
  });
  const finish = () => resolveResult({ blob: new Blob(['fake audio']), metadata: fakeMetadata() });
  if (autoStops) {
    // Simulate a known-duration source finishing on its own, with no
    // second click — resolve on the next microtask rather than
    // synchronously, so it behaves like a real async 'ended' event.
    void Promise.resolve().then(finish);
  }
  return { result, stop: finish, autoStops };
}

function fakeClient(overrides: Partial<PipelineClient> = {}): PipelineClient {
  return {
    upload: vi.fn().mockResolvedValue(fakeResult()),
    submitFeedback: vi.fn().mockResolvedValue(undefined),
    downloadUrl: vi.fn().mockReturnValue('http://localhost:8787/download/abc123'),
    ...overrides,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('mountCapturePanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('open', vi.fn());
  });

  it('starts idle', () => {
    const handle = mountCapturePanel(document.body, {
      startCapture: vi.fn().mockReturnValue(fakeCaptureHandle()),
      client: fakeClient(),
    });
    expect(handle.getStateKind()).toBe('idle');
    expect(document.getElementById('sample-lib-capture-button')?.textContent).toBe('Capture Sample');
  });

  it('walks idle -> recording -> uploading -> reviewing on a successful upload', async () => {
    const result = fakeResult();
    const client = fakeClient({ upload: vi.fn().mockResolvedValue(result) });
    const startCapture = vi.fn().mockReturnValue(fakeCaptureHandle());

    const handle = mountCapturePanel(document.body, { startCapture, client });
    const button = document.getElementById('sample-lib-capture-button') as HTMLButtonElement;

    button.click();
    expect(handle.getStateKind()).toBe('recording');
    expect(startCapture).toHaveBeenCalledTimes(1);

    button.click();
    await flushMicrotasks();

    expect(handle.getStateKind()).toBe('reviewing');
    expect(client.upload).toHaveBeenCalledTimes(1);

    const panel = document.getElementById('sample-lib-review-panel');
    expect(panel?.style.display).not.toBe('none');
    expect(panel?.textContent).toContain('BPM: 120');
    expect(panel?.textContent).toContain('Genre: trap');
    expect(panel?.textContent).toContain('Mood: dark ambient');
  });

  it('shows a distinct label for auto-stopping captures and finishes without a second click', async () => {
    const result = fakeResult();
    const client = fakeClient({ upload: vi.fn().mockResolvedValue(result) });
    const startCapture = vi.fn().mockReturnValue(fakeCaptureHandle(true));

    const handle = mountCapturePanel(document.body, { startCapture, client });
    const button = document.getElementById('sample-lib-capture-button') as HTMLButtonElement;

    button.click();
    expect(handle.getStateKind()).toBe('recording');
    expect(button.textContent).toBe('Recording full capture… (click to stop early)');

    // No second click — the fake handle's result resolves on its own,
    // same as a real known-duration source reaching its natural end.
    await flushMicrotasks();

    expect(handle.getStateKind()).toBe('reviewing');
    expect(client.upload).toHaveBeenCalledTimes(1);
  });

  it('uses the manual "Stop & Upload" label when the capture does not auto-stop', () => {
    const handle = mountCapturePanel(document.body, {
      startCapture: vi.fn().mockReturnValue(fakeCaptureHandle(false)),
      client: fakeClient(),
    });
    const button = document.getElementById('sample-lib-capture-button') as HTMLButtonElement;

    button.click();
    expect(handle.getStateKind()).toBe('recording');
    expect(button.textContent).toBe('Stop & Upload');
  });

  it('flags low-confidence tags inline', async () => {
    const result = fakeResult({ tags: fakeTags({ moodConfidence: 0.4 }) });
    const client = fakeClient({ upload: vi.fn().mockResolvedValue(result) });
    const handle = mountCapturePanel(document.body, {
      startCapture: vi.fn().mockReturnValue(fakeCaptureHandle()),
      client,
    });

    const button = document.getElementById('sample-lib-capture-button') as HTMLButtonElement;
    button.click();
    button.click();
    await flushMicrotasks();

    expect(handle.getStateKind()).toBe('reviewing');
    const panel = document.getElementById('sample-lib-review-panel');
    expect(panel?.textContent).toContain('Mood: dark ambient (low confidence)');
    expect(panel?.textContent).not.toContain('BPM: 120 (low confidence)');
  });

  it('shows a disambiguation prompt and submits a tag_correction when answered', async () => {
    const result = fakeResult({
      tags: fakeTags({ moodConfidence: 0.4 }),
      disambiguation: {
        field: 'mood',
        question: 'Leaning dark ambient or moody trap — which is closer?',
        options: ['dark ambient', 'moody trap'],
      },
    });
    const client = fakeClient({ upload: vi.fn().mockResolvedValue(result) });
    const handle = mountCapturePanel(document.body, {
      startCapture: vi.fn().mockReturnValue(fakeCaptureHandle()),
      client,
    });

    const button = document.getElementById('sample-lib-capture-button') as HTMLButtonElement;
    button.click();
    button.click();
    await flushMicrotasks();
    expect(handle.getStateKind()).toBe('reviewing');

    const optionButtons = document.querySelectorAll<HTMLButtonElement>('#sample-lib-disambiguation button');
    expect(optionButtons).toHaveLength(2);

    optionButtons[1].click();
    await flushMicrotasks();

    expect(client.submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tag_correction',
        sampleId: 'abc123',
        field: 'mood',
        producerFinalTag: 'moody trap',
      })
    );

    const panel = document.getElementById('sample-lib-review-panel');
    expect(panel?.textContent).toContain('Mood: moody trap');
  });

  it('submits naming feedback when the producer edits the generated name', async () => {
    const result = fakeResult();
    const client = fakeClient({ upload: vi.fn().mockResolvedValue(result) });
    const handle = mountCapturePanel(document.body, {
      startCapture: vi.fn().mockReturnValue(fakeCaptureHandle()),
      client,
    });

    const button = document.getElementById('sample-lib-capture-button') as HTMLButtonElement;
    button.click();
    button.click();
    await flushMicrotasks();
    expect(handle.getStateKind()).toBe('reviewing');

    const nameInput = document.getElementById('sample-lib-name-input') as HTMLInputElement;
    nameInput.value = 'riser';
    nameInput.dispatchEvent(new Event('change'));
    await flushMicrotasks();

    expect(client.submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'naming_feedback',
        sampleId: 'abc123',
        llmProposedName: result.generatedName,
        producerFinalName: 'riser',
      })
    );
  });

  it('does not submit naming feedback when the name field is left unchanged', async () => {
    const result = fakeResult();
    const client = fakeClient({ upload: vi.fn().mockResolvedValue(result) });
    mountCapturePanel(document.body, {
      startCapture: vi.fn().mockReturnValue(fakeCaptureHandle()),
      client,
    });

    const button = document.getElementById('sample-lib-capture-button') as HTMLButtonElement;
    button.click();
    button.click();
    await flushMicrotasks();

    const nameInput = document.getElementById('sample-lib-name-input') as HTMLInputElement;
    nameInput.dispatchEvent(new Event('change'));
    await flushMicrotasks();

    expect(client.submitFeedback).not.toHaveBeenCalled();
  });

  it('opens the download URL and resets to idle on download click', async () => {
    const result = fakeResult();
    const client = fakeClient({ upload: vi.fn().mockResolvedValue(result) });
    const handle = mountCapturePanel(document.body, {
      startCapture: vi.fn().mockReturnValue(fakeCaptureHandle()),
      client,
    });

    const button = document.getElementById('sample-lib-capture-button') as HTMLButtonElement;
    button.click();
    button.click();
    await flushMicrotasks();

    const downloadButton = document.getElementById('sample-lib-download-button') as HTMLButtonElement;
    downloadButton.click();

    expect(window.open).toHaveBeenCalledWith('http://localhost:8787/download/abc123', '_blank');
    expect(handle.getStateKind()).toBe('idle');
    expect(document.getElementById('sample-lib-review-panel')?.style.display).toBe('none');
  });

  it('returns to idle and alerts when upload fails', async () => {
    const client = fakeClient({ upload: vi.fn().mockRejectedValue(new Error('network down')) });
    const handle = mountCapturePanel(document.body, {
      startCapture: vi.fn().mockReturnValue(fakeCaptureHandle()),
      client,
    });

    const button = document.getElementById('sample-lib-capture-button') as HTMLButtonElement;
    button.click();
    button.click();
    await flushMicrotasks();

    expect(handle.getStateKind()).toBe('idle');
    expect(window.alert).toHaveBeenCalled();
  });
});
