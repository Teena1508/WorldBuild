import { FindingCategory, ChapterFindingSeverity } from '@/lib/db/types';

export interface OllamaModelTag {
  name: string;
  model: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaTagsResponse {
  models?: OllamaModelTag[];
}

export type OllamaErrorCode =
  | 'OLLAMA_NOT_RUNNING'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_BASE_URL'
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'CONTEXT_LIMIT_EXCEEDED'
  | 'UNKNOWN';

export interface OllamaStatus {
  isAvailable: boolean;
  baseUrl: string;
  configuredModel: string;
  modelAvailable: boolean;
  installedModels: string[];
  errorMessage?: string;
  errorCode?: OllamaErrorCode;
}

export interface RawAiFinding {
  category?: unknown;
  severity?: unknown;
  title?: unknown;
  description?: unknown;
  passage?: unknown;
  passage_reference?: unknown;
  conflicting_canon?: unknown;
  explanation?: unknown;
  suggested_fix?: unknown;
  confidence?: unknown;
}

export interface ValidatedAiFinding {
  category: FindingCategory;
  severity: ChapterFindingSeverity;
  title: string;
  description: string;
  passage: string | null;
  passage_reference: string | null;
  conflicting_canon: string | null;
  explanation: string;
  suggested_fix: string | null;
  confidence: number;
}

export interface CanonContextSummary {
  charactersCount: number;
  locationsCount: number;
  eventsCount: number;
  relationshipsCount: number;
  secretsCount: number;
  previousChaptersCount: number;
  passageWords: number;
  approximateTokens: number;
  isTruncated: boolean;
  modelUsed: string;
}

export interface ChapterAnalysisResult {
  chapterId: string;
  universeId?: string | null;
  storyId?: string | null;
  chapterVersion: number;
  findings: import('@/lib/db/types').ChapterAnalysisFinding[];
  summary: {
    total: number;
    deterministicCount: number;
    aiCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    openCount: number;
  };
  contextStats: CanonContextSummary;
  runtimeStatus: OllamaStatus;
}
