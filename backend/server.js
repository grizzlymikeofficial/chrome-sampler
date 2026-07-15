import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Stub backend for local end-to-end testing only — no real copyright check,
// no real tagging, no DB. Every upload gets a hardcoded "cleared" result and
// hardcoded tags. This exists to prove the capture -> upload -> download
// plumbing works; real Chromaprint/librosa/PANNs/Qdrant integration
// (prd-backend-pipeline.md) is a separate, later task. Per CLAUDE.md
// constraint #1, the copyright check being hardcoded to "cleared" here is a
// stub-only shortcut, not a production notify-only bypass — never treat
// this file as a template for the real pipeline's blocking behavior.

const PORT = 8787;
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());

const upload = multer({ dest: UPLOAD_DIR });

// In-memory only — resets on server restart. Fine for a local dev stub,
// not a substitute for the real vector-graph DB (prd-database-schema.md).
const captures = new Map();

// Genre/Mood models are named as an open decision in prd-overview.md — this
// stub just needs plausible confidence numbers to exercise the LLM-as-judge
// 0.7 threshold (prd-backend-pipeline.md section 3), not real classification.
const MOOD_LABELS = ['dark ambient', 'moody trap', 'melancholic lo-fi'];

app.post('/upload', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'missing audio file' });
  }

  let metadata = {};
  try {
    metadata = JSON.parse(req.body.metadata ?? '{}');
  } catch {
    return res.status(400).json({ error: 'metadata must be valid JSON' });
  }

  const id = randomUUID();
  captures.set(id, { storedPath: req.file.path, metadata });

  console.log(`[stub-backend] captured ${id} from ${metadata.sourcePlatform ?? 'unknown'}: ${metadata.title ?? '(no title)'}`);

  // Stub confidence is randomized only to exercise both branches of the
  // LLM-as-judge threshold in local testing — the real pipeline's
  // confidence comes from the actual audio ML models, not Math.random().
  const moodConfidence = Math.round(Math.random() * 100) / 100;
  const [primaryMood, alternateMood] = MOOD_LABELS;

  const response = {
    id,
    copyrightStatus: 'cleared_tier1',
    tags: {
      bpm: 120,
      bpmConfidence: 1,
      key: 'C minor',
      keyConfidence: 1,
      type: 'loop',
      category: 'kick',
      genre: 'trap',
      genreConfidence: 0.92,
      mood: primaryMood,
      moodConfidence,
    },
    generatedName: 'stub sample — kick, 120bpm, Cmin',
    downloadUrl: `/download/${id}`,
  };

  // Touchpoint 2: LLM-as-judge routes to the producer below the 0.7
  // threshold instead of auto-finalizing (prd-hitl-review.md touchpoint 2).
  if (moodConfidence < 0.7) {
    response.disambiguation = {
      field: 'mood',
      question: `Leaning ${primaryMood} or ${alternateMood} — which is closer?`,
      options: [primaryMood, alternateMood],
    };
  }

  res.json(response);
});

app.get('/download/:id', (req, res) => {
  const capture = captures.get(req.params.id);
  if (!capture) {
    return res.status(404).send('Not found — server restarted, or bad id.');
  }
  res.download(capture.storedPath, 'sample.webm');
});

// Touchpoints 4 & 6: naming feedback / tag correction. Stub just logs the
// tuple server-side — real pipeline persists it as a HITLEvent row
// (prd-database-schema.md) for the aggregate pattern agent to mine later.
app.post('/feedback', express.json(), (req, res) => {
  console.log('[stub-backend] HITL feedback', JSON.stringify(req.body));
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`[stub-backend] listening on http://localhost:${PORT}`);
});
