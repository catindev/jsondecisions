'use strict';

const { makeCompilationWarningEntry } = require('../errors');

/**
 * Phase 6: analyzeDecisionSets
 *
 * Static analysis of compiled decision sets. Never throws — returns warnings
 * that are attached to CompiledDecisions.warnings. All three checks operate
 * solely on the already-compiled in-memory structure.
 *
 * Checks performed per decision-set:
 *
 *   UNREACHABLE_RULE
 *     Rule B at position j is unreachable if there exists a rule A at position
 *     i < j whose conditions are a subset of B's conditions. Under
 *     first_match_wins semantics A will always fire before B for any input
 *     that would have matched B.
 *
 *   PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS
 *     A rule reads a fact via patchPlanFrom at runtime. If that path is not
 *     declared in requiredFacts the engine silently returns patchPlan: null
 *     when the fact is absent — which may be an unintended silent failure.
 *
 *   UNUSED_REQUIRED_FACT
 *     A path declared in requiredFacts is not referenced by any when condition
 *     across all rules. The declaration is either a dead entry or indicates a
 *     forgotten condition.
 */
function analyzeDecisionSets(decisionSets) {
  const warnings = [];

  for (const ds of decisionSets.values()) {
    warnings.push(...checkUnreachableRules(ds));
    warnings.push(...checkPatchPlanConsistency(ds));
    warnings.push(...checkUnusedRequiredFacts(ds));
  }

  return warnings;
}

/**
 * Subsumption check: rule at position j is unreachable if an earlier rule A
 * (position i < j) has conditions ⊆ conditions(j).
 *
 * Subsumption means: every (path, expected) pair in A also appears in B.
 * A has fewer or equal conditions. Under first_match_wins A fires first.
 */
function checkUnreachableRules(ds) {
  const warnings = [];
  const rules = ds.rules;

  for (let j = 1; j < rules.length; j++) {
    const candidate = rules[j];

    // Build a lookup map for candidate's conditions
    const candidateMap = new Map(
      candidate.conditions.map(c => [c.path, c.expected])
    );

    for (let i = 0; i < j; i++) {
      const earlier = rules[i];

      // earlier subsumes candidate if every condition of earlier appears in candidate
      // with the same path+expected value.
      // Vacuous case: earlier.conditions is empty (when: {}) → matches anything → always fires first.
      const subsumes = earlier.conditions.every(({ path, expected }) =>
        candidateMap.has(path) && candidateMap.get(path) === expected
      );

      if (subsumes) {
        warnings.push(makeCompilationWarningEntry(
          'UNREACHABLE_RULE',
          ds.id,
          'rules[' + j + ']',
          'Rule "' + candidate.ruleId + '" is unreachable: ' +
          'subsumed by earlier rule "' + earlier.ruleId + '" at position ' + i
        ));
        break; // one warning per unreachable rule is enough
      }
    }
  }

  return warnings;
}

/**
 * Warn if patchPlanFrom references a fact path not declared in requiredFacts.
 * An absent path causes a silent patchPlan: null at runtime, which is likely
 * unintentional if the rule depends on that value.
 */
function checkPatchPlanConsistency(ds) {
  const warnings = [];
  const requiredSet = new Set(ds.requiredFacts);

  for (const rule of ds.rules) {
    const ppf = rule.then.patchPlanFrom;
    if (ppf && !requiredSet.has(ppf)) {
      warnings.push(makeCompilationWarningEntry(
        'PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS',
        rule.ruleId,
        'then.patchPlanFrom',
        '"' + ppf + '" is not declared in requiredFacts — ' +
        'if the path is absent at runtime patchPlan will silently be null'
      ));
    }
  }

  return warnings;
}

/**
 * Warn if a requiredFacts path is never referenced by any when condition.
 * Such a path enforces presence but never contributes to a decision, which
 * suggests either a stale declaration or a forgotten condition.
 */
function checkUnusedRequiredFacts(ds) {
  const warnings = [];
  if (!ds.requiredFacts.length) return warnings;

  const usedInConditions = new Set(
    ds.rules.flatMap(r => r.conditions.map(c => c.path))
  );

  for (const fact of ds.requiredFacts) {
    if (!usedInConditions.has(fact)) {
      warnings.push(makeCompilationWarningEntry(
        'UNUSED_REQUIRED_FACT',
        ds.id,
        'requiredFacts',
        '"' + fact + '" is declared in requiredFacts but not referenced in any when condition'
      ));
    }
  }

  return warnings;
}

module.exports = { analyzeDecisionSets };
