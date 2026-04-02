'use strict';

const { makeCompilationErrorEntry } = require('../errors');

/**
 * Resolve a rule reference to an absolute artifact id.
 * Spec section 3:
 *   - starts with "library." → absolute
 *   - contains "."           → absolute
 *   - no "."                 → scoped: {decisionSetId}.{ref}
 */
function resolveRef(ref, decisionSetId) {
  if (ref.startsWith('library.') || ref.includes('.')) return ref;
  return decisionSetId + '.' + ref;
}

/**
 * Phase 4: validateRefs
 * Verifies that all rule references in decision-sets resolve to existing
 * decision-rule artifacts. Unknown refs and wrong-type refs are errors.
 */
function validateRefs(artifacts, registry) {
  const errors = [];

  for (const a of artifacts) {
    if (a.type !== 'decision-set') continue;

    for (let i = 0; i < (a.rules || []).length; i++) {
      const ref = a.rules[i];
      if (typeof ref !== 'string' || !ref) continue; // already caught in schema phase

      const absId = resolveRef(ref, a.id);

      if (!registry.has(absId)) {
        errors.push(makeCompilationErrorEntry(
          'UNRESOLVED_REF',
          a.id,
          'rules[' + i + ']',
          'rule ref "' + ref + '" resolves to "' + absId + '" which does not exist'
        ));
        continue;
      }

      const target = registry.get(absId);
      if (target.type !== 'decision-rule') {
        errors.push(makeCompilationErrorEntry(
          'REF_TARGET_WRONG_TYPE',
          a.id,
          'rules[' + i + ']',
          'rule ref "' + ref + '" resolves to "' + absId + '" which has type "' + target.type + '" (expected "decision-rule")'
        ));
      }
    }
  }

  return errors;
}

module.exports = { validateRefs, resolveRef };
