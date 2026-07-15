import { startTabCapture } from './capture/tab-capture-engine';
import { createPipelineClient } from './pipeline/client';
import type { CaptureHandle } from './capture/capture-engine';

// Local stub backend only (see backend/server.js) — same as content-script.ts.
const BACKEND_URL = 'http://localhost:8787';

function requireElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`popup: missing #${id}`);
  return el as T;
}

function main() {
  const button = requireElement<HTMLButtonElement>('record-button');
  const status = requireElement<HTMLDivElement>('status');
  const client = createPipelineClient(BACKEND_URL);

  let activeCapture: CaptureHandle | null = null;

  button.addEventListener('click', () => {
    void handleClick();
  });

  async function handleClick() {
    if (!activeCapture) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        status.textContent = 'No active tab found.';
        return;
      }

      try {
        activeCapture = await startTabCapture(tab);
      } catch (err) {
        console.error('[sample-lib] failed to start tab capture', err);
        status.textContent = 'Could not start recording — see console.';
        return;
      }

      button.textContent = 'Stop & Upload';
      status.textContent = 'Recording…';
      return;
    }

    const capture = activeCapture;
    activeCapture = null;
    button.disabled = true;
    button.textContent = 'Uploading…';
    status.textContent = '';

    capture.stop();
    const { blob, metadata } = await capture.result;

    try {
      const result = await client.upload(blob, metadata);
      status.replaceChildren();
      const link = document.createElement('a');
      link.href = client.downloadUrl(result);
      link.target = '_blank';
      link.textContent = 'Download';
      status.appendChild(link);
    } catch (err) {
      console.error('[sample-lib] upload failed', err);
      status.textContent = 'Upload failed — is the stub backend running? See console.';
    } finally {
      button.disabled = false;
      button.textContent = 'Record Audio';
    }
  }
}

main();
