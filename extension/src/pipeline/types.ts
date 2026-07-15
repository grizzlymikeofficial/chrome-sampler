// Mirrors the stub backend's response shape (backend/server.js) and, longer
// term, the real Tags entity in docs/prd-database-schema.md. Field names are
// camelCase here (client-side); the eventual real backend maps to the DB's
// snake_case columns — that mapping is a backend-task concern, not this one.

export interface Tags {
  bpm: number;
  bpmConfidence: number;
  key: string;
  keyConfidence: number;
  type: 'one-shot' | 'loop';
  category: string;
  genre: string;
  genreConfidence: number;
  mood: string;
  moodConfidence: number;
}

export interface Disambiguation {
  field: keyof Tags;
  question: string;
  options: string[];
}

export interface UploadResult {
  id: string;
  copyrightStatus: string;
  tags: Tags;
  generatedName: string;
  downloadUrl: string;
  disambiguation?: Disambiguation;
}

// prd-hitl-review.md touchpoint 6 tuple (tag correction).
export interface TagCorrectionFeedback {
  type: 'tag_correction';
  sampleId: string;
  field: keyof Tags;
  mlModelTag: string;
  mlModelConfidence: number;
  llmJudgeDecision: 'auto_finalize' | 'route_to_producer';
  producerFinalTag: string;
  producerComment?: string;
}

// prd-hitl-review.md touchpoint 4 tuple (naming feedback).
export interface NamingFeedback {
  type: 'naming_feedback';
  sampleId: string;
  algorithmicTags: Tags;
  llmProposedName: string;
  producerFinalName: string;
  producerComment?: string;
}

export type Feedback = TagCorrectionFeedback | NamingFeedback;
