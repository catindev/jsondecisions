'use strict';

const { isPlainObject } = require('../utils');
const { makeCompilationErrorEntry } = require('../errors');

const ALLOWED_WHEN_VALUE_TYPES = new Set(['string', 'number', 'boolean']);
const V2_WHEN_KEYS = new Set(['all', 'any', 'not']);

/**
 * Phase 2: validateSchema
 * Validates required/forbidden fields per artifact type.
 * Also rejects v2 when-syntax (all/any/not) which is unsupported in v1.
 */
function validateSchema(artifacts) {
  const errors = [];

  for (const a of artifacts) {
    if (a.type === 'decision-rule') {
      errors.push(...validateDecisionRule(a));
    } else if (a.type === 'decision-set') {
      errors.push(...validateDecisionSet(a));
    } else {
      errors.push(makeCompilationErrorEntry(
        'UNKNOWN_ARTIFACT_TYPE',
        a.id,
        'type',
        'Unknown type "' + a.type + '"'
      ));
    }
  }

  return errors;
}

function validateDecisionRule(a) {
  const errors = [];
  const id = a.id;

  if (!isPlainObject(a.when)) {
    errors.push(makeCompilationErrorEntry('INVALID_WHEN', id, 'when', '"when" must be a plain object'));
  } else {
    for (const key of Object.keys(a.when)) {
      if (V2_WHEN_KEYS.has(key)) {
        errors.push(makeCompilationErrorEntry(
          'UNSUPPORTED_WHEN_V2_KEY',
          id,
          'when.' + key,
          'Contains v2 key "' + key + '" (not supported in v1; only flat equality AND is allowed)'
        ));
      }
    }
    for (const [path, val] of Object.entries(a.when)) {
      if (val !== null && !ALLOWED_WHEN_VALUE_TYPES.has(typeof val)) {
        errors.push(makeCompilationErrorEntry(
          'INVALID_WHEN_VALUE_TYPE',
          id,
          'when.' + path,
          'Unsupported value type "' + typeof val + '" (allowed: string, number, boolean, null)'
        ));
      }
    }
  }

  if (!isPlainObject(a.then)) {
    errors.push(makeCompilationErrorEntry('INVALID_THEN', id, 'then', '"then" must be a plain object'));
  } else {
    if (typeof a.then.decision !== 'string' || !a.then.decision) {
      errors.push(makeCompilationErrorEntry('MISSING_THEN_DECISION', id, 'then.decision', '"then.decision" must be a non-empty string'));
    }
    if (typeof a.then.reason !== 'string' || !a.then.reason) {
      errors.push(makeCompilationErrorEntry('MISSING_THEN_REASON', id, 'then.reason', '"then.reason" must be a non-empty string'));
    }
    if (a.then.patchPlanFrom !== undefined) {
      if (typeof a.then.patchPlanFrom !== 'string' || !a.then.patchPlanFrom) {
        errors.push(makeCompilationErrorEntry('INVALID_PATCH_PLAN_FROM', id, 'then.patchPlanFrom', '"then.patchPlanFrom" must be a non-empty string if present'));
      }
    }
    if (a.then.metadata !== undefined && !isPlainObject(a.then.metadata)) {
      errors.push(makeCompilationErrorEntry('INVALID_METADATA', id, 'then.metadata', '"then.metadata" must be a plain object if present'));
    }
    if (a.then.tags !== undefined) {
      if (!Array.isArray(a.then.tags)) {
        errors.push(makeCompilationErrorEntry('INVALID_TAGS', id, 'then.tags', '"then.tags" must be an array if present'));
      } else {
        a.then.tags.forEach((tag, i) => {
          if (typeof tag !== 'string' || !tag) {
            errors.push(makeCompilationErrorEntry('INVALID_TAG', id, 'then.tags[' + i + ']', '"then.tags[' + i + ']" must be a non-empty string'));
          }
        });
      }
    }
  }

  return errors;
}

function validateDecisionSet(a) {
  const errors = [];
  const id = a.id;

  if (typeof a.version !== 'string' || !a.version) {
    errors.push(makeCompilationErrorEntry('MISSING_VERSION', id, 'version', '"version" must be a non-empty string'));
  }

  if (a.mode !== 'first_match_wins') {
    errors.push(makeCompilationErrorEntry('INVALID_MODE', id, 'mode', '"mode" must be "first_match_wins" in v1 (got: ' + a.mode + ')'));
  }

  if (!isPlainObject(a.defaultDecision)) {
    errors.push(makeCompilationErrorEntry('INVALID_DEFAULT_DECISION', id, 'defaultDecision', '"defaultDecision" must be a plain object'));
  } else {
    if (typeof a.defaultDecision.decision !== 'string' || !a.defaultDecision.decision) {
      errors.push(makeCompilationErrorEntry('MISSING_DEFAULT_DECISION', id, 'defaultDecision.decision', '"defaultDecision.decision" must be a non-empty string'));
    }
    if (typeof a.defaultDecision.reason !== 'string' || !a.defaultDecision.reason) {
      errors.push(makeCompilationErrorEntry('MISSING_DEFAULT_REASON', id, 'defaultDecision.reason', '"defaultDecision.reason" must be a non-empty string'));
    }
  }

  if (!Array.isArray(a.rules) || a.rules.length === 0) {
    errors.push(makeCompilationErrorEntry('INVALID_RULES', id, 'rules', '"rules" must be a non-empty array'));
  } else {
    a.rules.forEach((ref, i) => {
      if (typeof ref !== 'string' || !ref) {
        errors.push(makeCompilationErrorEntry('INVALID_RULE_REF', id, 'rules[' + i + ']', '"rules[' + i + ']" must be a non-empty string'));
      }
    });
  }

  if (a.missingFactPolicy !== undefined) {
    if (a.missingFactPolicy !== 'false' && a.missingFactPolicy !== 'error') {
      errors.push(makeCompilationErrorEntry('INVALID_MISSING_FACT_POLICY', id, 'missingFactPolicy', '"missingFactPolicy" must be "false" or "error" (got: ' + a.missingFactPolicy + ')'));
    }
  }

  if (a.requiredFacts !== undefined) {
    if (!Array.isArray(a.requiredFacts)) {
      errors.push(makeCompilationErrorEntry('INVALID_REQUIRED_FACTS', id, 'requiredFacts', '"requiredFacts" must be an array if present'));
    } else {
      a.requiredFacts.forEach((f, i) => {
        if (typeof f !== 'string' || !f) {
          errors.push(makeCompilationErrorEntry('INVALID_REQUIRED_FACT', id, 'requiredFacts[' + i + ']', '"requiredFacts[' + i + ']" must be a non-empty string'));
        }
      });
    }
  }

  if (a.strict !== undefined && typeof a.strict !== 'boolean') {
    errors.push(makeCompilationErrorEntry('INVALID_STRICT', id, 'strict', '"strict" must be boolean if present'));
  }

  return errors;
}

module.exports = { validateSchema };
