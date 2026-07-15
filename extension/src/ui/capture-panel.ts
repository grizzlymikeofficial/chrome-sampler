import type { CaptureHandle } from '../capture/capture-engine';
import type { PipelineClient } from '../pipeline/client';
import type { UploadResult } from '../pipeline/types';

export interface CapturePanelDeps {
  startCapture: () => CaptureHandle;
  client: PipelineClient;
}

type StateKind = 'idle' | 'recording' | 'uploading' | 'reviewing';

export interface CapturePanelHandle {
  getStateKind(): StateKind;
}

const BUTTON_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  bottom: '16px',
  right: '16px',
  zIndex: '2147483647',
  padding: '10px 18px',
  fontFamily: 'sans-serif',
  fontSize: '13px',
  fontWeight: '600',
  color: '#fff',
  background: '#222',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
};

const PANEL_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  bottom: '16px',
  right: '16px',
  zIndex: '2147483647',
  width: '280px',
  maxHeight: '70vh',
  overflowY: 'auto',
  fontFamily: 'sans-serif',
  fontSize: '12px',
  color: '#eee',
  background: '#222',
  border: '1px solid #444',
  borderRadius: '8px',
  padding: '12px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
};

// Post-capture flow per prd-extension-client.md + prd-hitl-review.md
// touchpoints 2/3/4/6. Touchpoint 5 (usage-match) needs real vector search
// and isn't built here — out of scope for this pass, not silently dropped.
export function mountCapturePanel(root: HTMLElement, deps: CapturePanelDeps): CapturePanelHandle {
  let stateKind: StateKind = 'idle';
  let activeCapture: CaptureHandle | null = null;
  let currentResult: UploadResult | null = null;
  let resolvedMood = '';

  const button = document.createElement('button');
  button.id = 'sample-lib-capture-button';
  Object.assign(button.style, BUTTON_STYLE);

  const panel = document.createElement('div');
  panel.id = 'sample-lib-review-panel';
  Object.assign(panel.style, PANEL_STYLE);
  panel.style.display = 'none';

  root.appendChild(button);
  root.appendChild(panel);

  function renderButton() {
    button.style.display = stateKind === 'reviewing' ? 'none' : '';
    switch (stateKind) {
      case 'idle':
        button.textContent = 'Capture Sample';
        button.disabled = false;
        break;
      case 'recording':
        button.textContent = activeCapture?.autoStops
          ? 'Recording full capture… (click to stop early)'
          : 'Stop & Upload';
        button.disabled = false;
        break;
      case 'uploading':
        button.textContent = 'Uploading…';
        button.disabled = true;
        break;
      case 'reviewing':
        break;
    }
  }

  function renderPanel() {
    panel.replaceChildren();
    if (stateKind !== 'reviewing' || !currentResult) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    const result = currentResult;

    const tagsList = document.createElement('ul');
    tagsList.style.listStyle = 'none';
    tagsList.style.padding = '0';
    tagsList.style.margin = '0 0 8px 0';

    const entries: Array<[string, string, number]> = [
      ['BPM', String(result.tags.bpm), result.tags.bpmConfidence],
      ['Key', result.tags.key, result.tags.keyConfidence],
      ['Type', result.tags.type, 1],
      ['Category', result.tags.category, 1],
      ['Genre', result.tags.genre, result.tags.genreConfidence],
      ['Mood', resolvedMood, result.tags.moodConfidence],
    ];
    for (const [label, value, confidence] of entries) {
      const li = document.createElement('li');
      li.textContent = `${label}: ${value}` + (confidence < 0.7 ? ' (low confidence)' : '');
      tagsList.appendChild(li);
    }
    panel.appendChild(tagsList);

    if (result.disambiguation) {
      const prompt = document.createElement('div');
      prompt.id = 'sample-lib-disambiguation';

      const question = document.createElement('p');
      question.textContent = result.disambiguation.question;
      prompt.appendChild(question);

      for (const option of result.disambiguation.options) {
        const optionButton = document.createElement('button');
        optionButton.textContent = option;
        optionButton.addEventListener('click', () => {
          void answerDisambiguation(result, option);
        });
        prompt.appendChild(optionButton);
      }
      panel.appendChild(prompt);
    }

    const nameInput = document.createElement('input');
    nameInput.id = 'sample-lib-name-input';
    nameInput.value = result.generatedName;
    nameInput.addEventListener('change', () => {
      void handleNameChange(result, nameInput.value);
    });
    panel.appendChild(nameInput);

    const downloadButton = document.createElement('button');
    downloadButton.id = 'sample-lib-download-button';
    downloadButton.textContent = 'Download';
    downloadButton.addEventListener('click', () => {
      window.open(deps.client.downloadUrl(result), '_blank');
      reset();
    });
    panel.appendChild(downloadButton);
  }

  function render() {
    renderButton();
    renderPanel();
  }

  function reset() {
    stateKind = 'idle';
    activeCapture = null;
    currentResult = null;
    resolvedMood = '';
    render();
  }

  async function answerDisambiguation(result: UploadResult, choice: string) {
    if (!result.disambiguation) return;
    resolvedMood = choice;
    renderPanel();
    try {
      await deps.client.submitFeedback({
        type: 'tag_correction',
        sampleId: result.id,
        field: result.disambiguation.field,
        mlModelTag: result.tags.mood,
        mlModelConfidence: result.tags.moodConfidence,
        llmJudgeDecision: 'route_to_producer',
        producerFinalTag: choice,
      });
    } catch (err) {
      console.error('[sample-lib] failed to submit tag correction', err);
    }
  }

  async function handleNameChange(result: UploadResult, newName: string) {
    if (newName === result.generatedName) return;
    try {
      await deps.client.submitFeedback({
        type: 'naming_feedback',
        sampleId: result.id,
        algorithmicTags: result.tags,
        llmProposedName: result.generatedName,
        producerFinalName: newName,
      });
    } catch (err) {
      console.error('[sample-lib] failed to submit naming feedback', err);
    }
  }

  async function handleClick() {
    if (stateKind === 'idle') {
      let capture: CaptureHandle;
      try {
        capture = deps.startCapture();
        activeCapture = capture;
      } catch (err) {
        console.error('[sample-lib] failed to start capture', err);
        alert('Could not start capture on this page — see console for details.');
        return;
      }
      stateKind = 'recording';
      render();

      try {
        // Resolves on its own once a known-duration source reaches its
        // natural end (autoStops), or once a second click calls stop() —
        // either way, this same handleClick() call carries the capture
        // through to upload without needing a separate click-driven branch.
        const { blob, metadata } = await capture.result;
        activeCapture = null;
        stateKind = 'uploading';
        render();

        const result = await deps.client.upload(blob, metadata);
        currentResult = result;
        resolvedMood = result.tags.mood;
        stateKind = 'reviewing';
      } catch (err) {
        console.error('[sample-lib] capture/upload failed', err);
        alert('Capture or upload failed — see console for details.');
        activeCapture = null;
        stateKind = 'idle';
      }
      render();
      return;
    }

    if (stateKind === 'recording' && activeCapture) {
      activeCapture.stop();
    }
  }

  button.addEventListener('click', () => {
    void handleClick();
  });

  render();

  return {
    getStateKind: () => stateKind,
  };
}
