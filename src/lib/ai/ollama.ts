import {
  OllamaStatus,
  OllamaTagsResponse,
  ValidatedAiFinding,
  RawAiFinding,
  OllamaErrorCode,
} from './types';
import { FindingCategory, ChapterFindingSeverity } from '@/lib/db/types';

export class OllamaError extends Error {
  code: OllamaErrorCode;
  constructor(message: string, code: OllamaErrorCode) {
    super(message);
    this.name = 'OllamaError';
    this.code = code;
  }
}

/**
 * Validates that the provided runtime URL points to a secure local loopback address.
 * Prevents Server-Side Request Forgery (SSRF) and guarantees manuscript privacy.
 */
export function validateLocalRuntimeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new OllamaError(
        `Invalid protocol "${parsed.protocol}". Ollama runtime must use http:// or https://.`,
        'INVALID_BASE_URL'
      );
    }

    const host = parsed.hostname.toLowerCase();
    const isLoopback =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.localhost');

    const allowRemote = process.env.OLLAMA_ALLOW_REMOTE_HOST === 'true';

    if (!isLoopback && !allowRemote) {
      throw new OllamaError(
        `Security boundary violation: Ollama runtime host "${host}" is not a local loopback address. ` +
          `WORLDBUILD enforces strictly local AI to protect author manuscript privacy. ` +
          `Set OLLAMA_BASE_URL to http://127.0.0.1:11434.`,
        'INVALID_BASE_URL'
      );
    }

    return parsed.origin;
  } catch (err) {
    if (err instanceof OllamaError) throw err;
    throw new OllamaError(
      `Invalid OLLAMA_BASE_URL: ${err instanceof Error ? err.message : String(err)}`,
      'INVALID_BASE_URL'
    );
  }
}

export function getOllamaConfig() {
  const rawBaseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const baseUrl = validateLocalRuntimeUrl(rawBaseUrl);
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS) || 60000;

  return { baseUrl, model, timeoutMs };
}

/**
 * Checks if the local Ollama daemon is reachable and whether the configured model is installed.
 */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  let config;
  try {
    config = getOllamaConfig();
  } catch (err) {
    return {
      isAvailable: false,
      baseUrl: 'invalid',
      configuredModel: 'unknown',
      modelAvailable: false,
      installedModels: [],
      errorMessage: err instanceof Error ? err.message : 'Invalid configuration',
      errorCode: 'INVALID_BASE_URL',
    };
  }

  const { baseUrl, model } = config;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        isAvailable: false,
        baseUrl,
        configuredModel: model,
        modelAvailable: false,
        installedModels: [],
        errorMessage: `Ollama returned HTTP status ${res.status}: ${res.statusText}`,
        errorCode: 'UNKNOWN',
      };
    }

    const data = (await res.json()) as OllamaTagsResponse;
    const installedModels = (data.models || []).map((m) => m.name || m.model || '');

    const modelNormalized = model.toLowerCase();
    const isModelInstalled = installedModels.some((inst) => {
      const instNorm = inst.toLowerCase();
      return (
        instNorm === modelNormalized ||
        instNorm === `${modelNormalized}:latest` ||
        instNorm.startsWith(`${modelNormalized}:`)
      );
    });

    return {
      isAvailable: true,
      baseUrl,
      configuredModel: model,
      modelAvailable: isModelInstalled,
      installedModels,
      errorMessage: isModelInstalled
        ? undefined
        : `Model "${model}" is not installed in local Ollama library. Run "ollama pull ${model}" to download it.`,
      errorCode: isModelInstalled ? undefined : 'MODEL_NOT_FOUND',
    };
  } catch (err) {
    const isConnRefused =
      err instanceof Error &&
      (err.message.includes('ECONNREFUSED') ||
        err.message.includes('fetch failed') ||
        err.name === 'AbortError');

    const msg = isConnRefused
      ? `Local Ollama runtime is not reachable at ${baseUrl}. Ensure Ollama is installed and running ("ollama serve").`
      : `Failed to connect to local Ollama runtime: ${err instanceof Error ? err.message : String(err)}`;

    return {
      isAvailable: false,
      baseUrl,
      configuredModel: model,
      modelAvailable: false,
      installedModels: [],
      errorMessage: msg,
      errorCode: isConnRefused ? 'OLLAMA_NOT_RUNNING' : 'UNKNOWN',
    };
  }
}

/**
 * Validates and sanitizes raw AI finding objects into strict, schema-conformant findings.
 */
const VALID_CATEGORIES: Set<FindingCategory> = new Set([
  'timeline_paradox',
  'character_knowledge',
  'spatial_impossibility',
  'causal_inconsistency',
  'unresolved_setup',
  'object_continuity',
  'unexplained_transfer',
  'canon_contradiction',
]);

const VALID_SEVERITIES: Set<ChapterFindingSeverity> = new Set(['critical', 'high', 'medium', 'low']);

export function validateAiFinding(raw: unknown): ValidatedAiFinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as RawAiFinding;

  const rawTitle = typeof item.title === 'string' ? item.title.trim() : '';
  const rawExplanation = typeof item.explanation === 'string' ? item.explanation.trim() : '';
  if (!rawTitle || !rawExplanation) return null;

  let category: FindingCategory = 'causal_inconsistency';
  if (typeof item.category === 'string') {
    const catClean = item.category.toLowerCase().replace(/[\s-]/g, '_') as FindingCategory;
    if (VALID_CATEGORIES.has(catClean)) {
      category = catClean;
    } else if (catClean.includes('know')) {
      category = 'character_knowledge';
    } else if (catClean.includes('time') || catClean.includes('chron')) {
      category = 'timeline_paradox';
    } else if (catClean.includes('space') || catClean.includes('locat')) {
      category = 'spatial_impossibility';
    } else if (catClean.includes('object') || catClean.includes('item')) {
      category = 'object_continuity';
    } else if (catClean.includes('transfer')) {
      category = 'unexplained_transfer';
    }
  }

  let severity: ChapterFindingSeverity = 'medium';
  if (typeof item.severity === 'string') {
    const sevClean = item.severity.toLowerCase().trim() as ChapterFindingSeverity;
    if (VALID_SEVERITIES.has(sevClean)) {
      severity = sevClean;
    }
  }

  let confidence = 0.85;
  if (typeof item.confidence === 'number' && !isNaN(item.confidence)) {
    confidence = Math.max(0.1, Math.min(1.0, item.confidence));
  }

  const description = typeof item.description === 'string' ? item.description.trim() : rawExplanation;
  const passage = typeof item.passage === 'string' && item.passage.trim().length > 0 ? item.passage.trim() : null;
  const passageReference =
    typeof item.passage_reference === 'string' && item.passage_reference.trim().length > 0
      ? item.passage_reference.trim()
      : null;
  const conflictingCanon =
    typeof item.conflicting_canon === 'string' && item.conflicting_canon.trim().length > 0
      ? item.conflicting_canon.trim()
      : null;
  const suggestedFix =
    typeof item.suggested_fix === 'string' && item.suggested_fix.trim().length > 0
      ? item.suggested_fix.trim()
      : null;

  return {
    category,
    severity,
    title: rawTitle,
    description,
    passage,
    passage_reference: passageReference,
    conflicting_canon: conflictingCanon,
    explanation: rawExplanation,
    suggested_fix: suggestedFix,
    confidence: Number(confidence.toFixed(3)),
  };
}

export function validateAiFindingsArray(data: unknown): ValidatedAiFinding[] {
  let list: unknown[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.findings)) {
      list = obj.findings;
    } else if (Array.isArray(obj.contradictions)) {
      list = obj.contradictions;
    } else if (Array.isArray(obj.issues)) {
      list = obj.issues;
    } else if (Array.isArray(obj.results)) {
      list = obj.results;
    }
  }

  const validated: ValidatedAiFinding[] = [];
  for (const item of list) {
    const parsed = validateAiFinding(item);
    if (parsed) {
      validated.push(parsed);
    }
  }
  return validated;
}

/**
 * Dispatches an offline narrative analysis request to the local Ollama runtime.
 * Never calls any external or cloud AI service.
 */
export async function queryLocalOllama(
  prompt: string,
  systemPrompt: string
): Promise<{ findings: ValidatedAiFinding[]; rawOutput: string }> {
  const { baseUrl, model, timeoutMs } = getOllamaConfig();

  // 1. Verify runtime status before attempting heavy inference
  const status = await checkOllamaStatus();
  if (!status.isAvailable) {
    throw new OllamaError(
      status.errorMessage || `Ollama is not running at ${baseUrl}`,
      status.errorCode || 'OLLAMA_NOT_RUNNING'
    );
  }

  if (!status.modelAvailable) {
    throw new OllamaError(
      status.errorMessage || `Model "${model}" is not installed in local Ollama`,
      'MODEL_NOT_FOUND'
    );
  }

  // 2. Execute local inference with structured JSON format
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        system: systemPrompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.1,
          top_p: 0.9,
          num_predict: 2048,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new OllamaError(
        `Ollama generation failed with HTTP ${response.status}: ${errText}`,
        'UNKNOWN'
      );
    }

    const resJson = (await response.json()) as { response?: string };
    const rawOutput = resJson.response || '';

    if (!rawOutput.trim()) {
      return { findings: [], rawOutput: '' };
    }

    // 3. Parse JSON output safely
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawOutput);
    } catch {
      // Attempt cleanup if wrapped in markdown code blocks
      const clean = rawOutput.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      try {
        parsedJson = JSON.parse(clean);
      } catch {
        throw new OllamaError(
          `Local model returned malformed non-JSON response: ${rawOutput.slice(0, 300)}...`,
          'MALFORMED_RESPONSE'
        );
      }
    }

    // 4. Validate output with TypeScript schema
    const findings = validateAiFindingsArray(parsedJson);
    return { findings, rawOutput };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof OllamaError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OllamaError(
        `Local model inference timed out after ${timeoutMs / 1000}s. The model may be too large for available RAM or processing capacity.`,
        'TIMEOUT'
      );
    }
    throw new OllamaError(
      `Local inference error: ${err instanceof Error ? err.message : String(err)}`,
      'UNKNOWN'
    );
  }
}
