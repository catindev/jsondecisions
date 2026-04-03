export interface CompilationErrorEntry {
  code: string;
  artifactId: string | null;
  path: string | null;
  message: string;
}

export declare class CompilationError extends Error {
  name: 'CompilationError';
  errors: CompilationErrorEntry[];
  constructor(errors: CompilationErrorEntry[]);
}

/**
 * Warnings have the same shape as CompilationErrorEntry but are never thrown.
 * They indicate likely rule authoring mistakes found at compile time.
 * Returned in CompiledDecisions.warnings.
 *
 * Warning codes:
 *   UNREACHABLE_RULE                       — rule is subsumed by an earlier rule
 *   PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS  — patchPlanFrom path not in requiredFacts
 *   UNUSED_REQUIRED_FACT                   — requiredFacts path never used in any when
 */
export interface CompilationWarningEntry {
  code: string;
  artifactId: string | null;
  path: string | null;
  message: string;
}

export interface TraceFailedCondition {
  fact: string;
  expected: unknown;
  actual: unknown;
}

export interface TraceEntry {
  ruleId: string;
  matched: boolean;
  failedConditions?: TraceFailedCondition[];
}

export interface AbortErrorDetails {
  traceBeforeDefault?: TraceEntry[];
  [key: string]: unknown;
}

export interface AbortError {
  code: string;
  message: string;
  fact?: string;
  entrypointId?: string;
  details?: AbortErrorDetails;
  [key: string]: unknown;
}

export interface MatchedDecisionResult {
  status: 'MATCHED';
  decision: string;
  reason: string;
  matchedRuleId: string;
  decisionSetVersion: string | null;
  patchPlan: unknown;
  metadata: Record<string, unknown>;
  tags: string[];
  trace: TraceEntry[];
}

export interface DefaultedDecisionResult {
  status: 'DEFAULTED';
  decision: string;
  reason: string;
  matchedRuleId: null;
  decisionSetVersion: string | null;
  patchPlan: null;
  metadata: Record<string, unknown>;
  tags: string[];
  trace: TraceEntry[];
}

export interface AbortDecisionResult {
  status: 'ABORT';
  decision: null;
  reason: null;
  matchedRuleId: null;
  decisionSetVersion: string | null;
  patchPlan: null;
  metadata: Record<string, unknown>;
  tags: string[];
  trace: TraceEntry[];
  error: AbortError;
}

export type DecisionResult = MatchedDecisionResult | DefaultedDecisionResult | AbortDecisionResult;

export interface SourceInfo {
  file: string;
  rel: string;
}

export interface ReadOnlyMapLike<K, V> extends Iterable<[K, V]> {
  readonly size: number;
  get(key: K): V | undefined;
  has(key: K): boolean;
  forEach(callback: (value: V, key: K) => void, thisArg?: unknown): void;
  entries(): IterableIterator<[K, V]>;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
}

export interface CompiledCondition {
  path: string;
  expected: string | number | boolean | null;
}

export interface CompiledRuleThen {
  decision: string;
  reason: string;
  patchPlanFrom: string | null;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface CompiledRule {
  ruleId: string;
  conditions: readonly CompiledCondition[];
  then: CompiledRuleThen;
}

export interface CompiledDecisionSet {
  id: string;
  version: string;
  mode: 'first_match_wins';
  missingFactPolicy: 'false' | 'error';
  requiredFacts: string[];
  strict: boolean;
  defaultDecision: {
    decision: string;
    reason: string;
  };
  rules: readonly CompiledRule[];
}

export interface CompiledDecisions {
  registry: ReadOnlyMapLike<string, unknown>;
  decisionSets: ReadOnlyMapLike<string, CompiledDecisionSet>;
  sources: ReadOnlyMapLike<string, SourceInfo> | null;
  /** Compile-time warnings. Empty array if no issues detected. Never throws. */
  warnings: readonly CompilationWarningEntry[];
}

export interface CompileOptions {
  sources?: Map<string, SourceInfo>;
}

export interface RunOptions {
  trace?: boolean;
}

export interface DecisionEngine {
  compile(artifacts: unknown[], options?: CompileOptions): CompiledDecisions;
  run(compiled: CompiledDecisions, entrypointId: string, facts: unknown, options?: RunOptions): DecisionResult;
}

export declare function createEngine(): DecisionEngine;
