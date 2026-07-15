import type { Feedback, UploadResult } from './types';
import type { SampleMetadata } from '../adapters/types';

export interface PipelineClient {
  upload(blob: Blob, metadata: SampleMetadata): Promise<UploadResult>;
  submitFeedback(feedback: Feedback): Promise<void>;
  downloadUrl(result: UploadResult): string;
}

// Talks to the local stub backend only (backend/server.js) — hardcoded URL
// is fine for a dev-only demo, not something to make configurable yet.
export function createPipelineClient(backendUrl: string): PipelineClient {
  return {
    async upload(blob, metadata) {
      const form = new FormData();
      form.append('audio', blob, 'capture.webm');
      form.append('metadata', JSON.stringify(metadata));

      const res = await fetch(`${backendUrl}/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      return res.json();
    },

    async submitFeedback(feedback) {
      const res = await fetch(`${backendUrl}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback),
      });
      if (!res.ok) throw new Error(`feedback submission failed: ${res.status}`);
    },

    downloadUrl(result) {
      return `${backendUrl}${result.downloadUrl}`;
    },
  };
}
