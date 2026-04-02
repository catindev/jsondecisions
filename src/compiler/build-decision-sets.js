'use strict';

const { resolveRef } = require('./validate-refs');
const { deepCloneValue, deepFreezeValue } = require('../utils');

/**
 * Phase 5: buildDecisionSets
 * Compiles decision-set and decision-rule artifacts into frozen internal
 * structures. All refs are resolved to absolute ids.
 *
 * CompiledDecisionSet {
 *   id, version, mode, missingFactPolicy, requiredFacts, strict,
 *   defaultDecision, rules: CompiledRule[]
 * }
 *
 * CompiledRule {
 *   ruleId, conditions: CompiledCondition[], then: { decision, reason, patchPlanFrom?, metadata?, tags? }
 * }
 *
 * CompiledCondition { path, expected }
 */
function buildDecisionSets(artifacts, registry) {
  const decisionSets = new Map();

  for (const a of artifacts) {
    if (a.type !== 'decision-set') continue;

    const compiledRules = a.rules.map(ref => {
      const absId = resolveRef(ref, a.id);
      const rule = registry.get(absId);

      const conditions = Object.entries(rule.when).map(([path, expected]) =>
        Object.freeze({ path, expected })
      );

      const then = deepFreezeValue({
        decision: rule.then.decision,
        reason: rule.then.reason,
        patchPlanFrom: rule.then.patchPlanFrom || null,
        metadata: rule.then.metadata ? deepCloneValue(rule.then.metadata) : {},
        tags: rule.then.tags ? [...rule.then.tags] : [],
      });

      return Object.freeze({
        ruleId: absId,
        conditions: Object.freeze(conditions),
        then,
      });
    });

    decisionSets.set(a.id, deepFreezeValue({
      id: a.id,
      version: a.version,
      mode: a.mode,
      missingFactPolicy: a.missingFactPolicy || 'false',
      requiredFacts: Array.isArray(a.requiredFacts) ? [...a.requiredFacts] : [],
      strict: a.strict === true,
      defaultDecision: {
        decision: a.defaultDecision.decision,
        reason: a.defaultDecision.reason,
      },
      rules: compiledRules,
    }));
  }

  return decisionSets;
}

module.exports = { buildDecisionSets };
