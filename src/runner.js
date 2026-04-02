'use strict';

const { flattenFacts, getPath, deepCloneValue } = require('./utils');

/**
 * run(compiled, entrypointId, facts, options?)
 *
 * Implements the normative algorithm from spec section 7.
 * Steps:
 *   1. Flatten facts to dot-notation map
 *   2. Find decision-set
 *   3. [Level 1] Upfront requiredFacts check — before any rule evaluation
 *   4. For each rule: [Level 2] lazy missingFactPolicy per condition
 *   5. If matched: resolve patchPlan (silent, never ABORT)
 *   6. No match: strict → ABORT, else DEFAULTED
 *
 * Key invariants (see spec):
 * - null is a valid fact value, NOT equivalent to a missing path
 * - patchPlanFrom NEVER triggers missingFactPolicy — absence gives patchPlan: null
 * - error field is ABSENT (not null) on MATCHED/DEFAULTED responses
 * - trace does not affect decisions — pure diagnostic
 * - strict does NOT force trace collection; traceBeforeDefault = [] when trace: false
 */
function run(compiled, entrypointId, facts, options) {
  const traceEnabled = !options || options.trace !== false;
  const trace = [];

  // Step 1: Normalize facts
  const flatFacts = flattenFacts(facts || {});

  // Step 2: Find decision-set
  const decisionSet = compiled.decisionSets.get(entrypointId);
  if (!decisionSet) {
    return makeAbort(null, trace, {
      code: 'UNKNOWN_ENTRYPOINT',
      message: 'Decision set not found: ' + entrypointId,
      entrypointId,
    });
  }

  const version = decisionSet.version;

  // Step 3: [Level 1] Upfront requiredFacts check
  // Path is "present" if it EXISTS in flatFacts — even if value is null.
  for (const factPath of decisionSet.requiredFacts) {
    const { found } = getPath(flatFacts, factPath);
    if (!found) {
      return makeAbort(version, trace, {
        code: 'REQUIRED_FACT_MISSING',
        message: 'Required fact absent: ' + factPath,
        fact: factPath,
      });
    }
  }

  // Step 4: Evaluate rules in order
  const missingFactPolicy = decisionSet.missingFactPolicy;

  for (const compiledRule of decisionSet.rules) {
    const evalResult = evaluateWhen(compiledRule.conditions, flatFacts, missingFactPolicy);

    if (evalResult.abortError) {
      return makeAbort(version, trace, evalResult.abortError);
    }

    if (traceEnabled) {
      const entry = { ruleId: compiledRule.ruleId, matched: evalResult.matched };
      if (!evalResult.matched) entry.failedConditions = evalResult.failedConditions;
      trace.push(entry);
    }

    if (evalResult.matched) {
      // Step 5: patchPlanFrom — silent, never ABORT
      const patchPlan = resolvePatchPlan(compiledRule.then.patchPlanFrom, flatFacts);

      return {
        status: 'MATCHED',
        decision: compiledRule.then.decision,
        reason: compiledRule.then.reason,
        matchedRuleId: compiledRule.ruleId,
        decisionSetVersion: version,
        patchPlan,
        metadata: deepCloneValue(compiledRule.then.metadata),
        tags: [...compiledRule.then.tags],
        trace,
      };
    }
  }

  // Step 6: No rule matched
  if (decisionSet.strict) {
    return makeAbort(version, trace, {
      code: 'DEFAULT_REACHED_IN_STRICT_MODE',
      message: 'No rule matched and strict mode prohibits DEFAULTED',
      entrypointId,
      details: {
        // traceBeforeDefault mirrors the trace collected so far.
        // When trace=false the trace array is empty — strict does NOT force collection.
        traceBeforeDefault: traceEnabled ? [...trace] : [],
      },
    });
  }

  return {
    status: 'DEFAULTED',
    decision: decisionSet.defaultDecision.decision,
    reason: decisionSet.defaultDecision.reason,
    matchedRuleId: null,
    decisionSetVersion: version,
    patchPlan: null,
    metadata: {},
    tags: [],
    trace,
  };
}

/**
 * Evaluate all conditions in a rule's when clause.
 * [Level 2] missingFactPolicy applies lazily per condition.
 *
 * Returns:
 *   { matched: true, failedConditions: [], abortError: null }
 *   { matched: false, failedConditions: [...], abortError: null }
 *   { matched: false, failedConditions: [], abortError: { code, message, fact } }
 */
function evaluateWhen(conditions, flatFacts, missingFactPolicy) {
  const failedConditions = [];

  for (const { path, expected } of conditions) {
    const { found, value } = getPath(flatFacts, path);

    if (!found) {
      if (missingFactPolicy === 'error') {
        return {
          matched: false,
          failedConditions: [],
          abortError: {
            code: 'MISSING_FACT',
            message: 'Fact path absent in when condition: ' + path,
            fact: path,
          },
        };
      }
      // missingFactPolicy: "false" — condition fails, continue to next condition
      failedConditions.push({ fact: path, expected, actual: '__MISSING__' });
    } else if (value !== expected) {
      failedConditions.push({ fact: path, expected, actual: value });
    }
  }

  return {
    matched: failedConditions.length === 0,
    failedConditions,
    abortError: null,
  };
}

/**
 * Resolve patchPlanFrom.
 * CRITICAL: This is a separate read channel from facts.
 *   - Never triggers missingFactPolicy.
 *   - Absent path → null (always silent).
 *   - Arrays/objects are returned as DEEP COPIES so callers cannot mutate input facts through DecisionResult.
 */
function resolvePatchPlan(patchPlanFrom, flatFacts) {
  if (!patchPlanFrom) return null;
  const { found, value } = getPath(flatFacts, patchPlanFrom);
  return found ? deepCloneValue(value) : null;
}

/**
 * Build an ABORT result.
 * The `error` field is present ONLY on ABORT — it is absent (not null) on other statuses.
 */
function makeAbort(decisionSetVersion, trace, error) {
  return {
    status: 'ABORT',
    decision: null,
    reason: null,
    matchedRuleId: null,
    decisionSetVersion: decisionSetVersion || null,
    patchPlan: null,
    metadata: {},
    tags: [],
    trace,
    error,
  };
}

module.exports = { run };
