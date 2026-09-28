import type { ChatMessage, IntentConfidence, LLMProvider } from '@devdigest/shared';
import { IntentClassification, type IntentClassifierInput } from './schema.js';
import { buildIntentMessages, type IntentPromptSection, type IntentDocumentChars } from './classifier-prompt.js';
import { clampIntentConfidence, sanitizeOutOfScopeFiles } from './confidence.js';
import {
  INTENT_SCHEMA_NAME,
  INTENT_MAX_RETRIES,
  INTENT_TEMPERATURE,
  INTENT_MAX_TOKENS,
  INTENT_MAX_LIST_ITEMS,
  INTENT_MAX_ITEM_CHARS,
} from './constants.js';

/**
 * classifyIntent — the single structured-output call, plus the deterministic
 * post-processing (confidence clamp + `out_of_scope_files` sanitization) that
 * makes the result safe to trust downstream. Pure: no I/O beyond the injected
 * `LLMProvider`; the caller (server) resolves all sources beforehand.
 */

export interface ClassifyIntentResult {
  /** After clamp + sanitize — this is the value callers should persist/use. */
  intent: IntentClassification;
  /** The model's raw self-reported confidence, before clamping (for logging). */
  modelConfidence: IntentConfidence;
  sections: IntentPromptSection[];
  documentChars: IntentDocumentChars[];
  messages: ChatMessage[];
  tokensIn: number;
  tokensOut: number;
  apiCostUsd: number | null;
  attempts: number;
}

function capList(items: string[]): string[] {
  return items.slice(0, INTENT_MAX_LIST_ITEMS).map((s) => s.slice(0, INTENT_MAX_ITEM_CHARS));
}

export async function classifyIntent(a: {
  llm: LLMProvider;
  model: string;
  input: IntentClassifierInput;
  sessionId?: string;
}): Promise<ClassifyIntentResult> {
  const { messages, sections, documentChars } = buildIntentMessages(a.input);

  const res = await a.llm.completeStructured<IntentClassification>({
    model: a.model,
    schema: IntentClassification,
    schemaName: INTENT_SCHEMA_NAME,
    messages,
    maxRetries: INTENT_MAX_RETRIES,
    temperature: INTENT_TEMPERATURE,
    maxTokens: INTENT_MAX_TOKENS,
    ...(a.sessionId ? { sessionId: a.sessionId } : {}),
  });

  const changedPaths = a.input.files.map((f) => f.path);
  const clampedConfidence = clampIntentConfidence(res.data.confidence, {
    bodyChars: (a.input.pr.body ?? '').length,
    resolvedIssues: a.input.issues.length,
    resolvedDocuments: a.input.documents.length,
    unresolved: a.input.unresolved.length,
    inScopeCount: res.data.in_scope.length,
  });

  const intent: IntentClassification = {
    intent: res.data.intent.slice(0, INTENT_MAX_ITEM_CHARS),
    in_scope: capList(res.data.in_scope),
    out_of_scope: capList(res.data.out_of_scope),
    out_of_scope_files: capList(sanitizeOutOfScopeFiles(res.data.out_of_scope_files, changedPaths)),
    missing_context: capList(res.data.missing_context),
    confidence: clampedConfidence,
  };

  return {
    intent,
    modelConfidence: res.data.confidence,
    sections,
    documentChars,
    messages,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    apiCostUsd: res.apiCostUsd,
    attempts: res.attempts,
  };
}
