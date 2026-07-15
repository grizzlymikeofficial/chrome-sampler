import { getActiveAdapter } from './adapters/registry';
import { startCapture } from './capture/capture-engine';
import { createPipelineClient } from './pipeline/client';
import { mountCapturePanel } from './ui/capture-panel';

// Local stub backend only (see backend/server.js) — hardcoded, not
// configurable, because this is a dev-only demo, not a shipped build.
const BACKEND_URL = 'http://localhost:8787';

function main() {
  if (!getActiveAdapter()) return;
  if (document.getElementById('sample-lib-capture-button')) return;

  mountCapturePanel(document.body, {
    startCapture,
    client: createPipelineClient(BACKEND_URL),
  });
}

main();
