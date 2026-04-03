'use strict';

const { CompilationError, makeCompilationErrorEntry } = require('../errors');
const { buildRegistry } = require('./build-registry');
const { validateSchema } = require('./validate-schema');
const { validateRefs } = require('./validate-refs');
const { buildDecisionSets } = require('./build-decision-sets');
const { analyzeDecisionSets } = require('./analyze-decision-sets');
const { deepCloneValue, deepFreezeValue, createReadOnlyMap } = require('../utils');

function compile(artifacts, options) {
  if (!Array.isArray(artifacts)) {
    throw new CompilationError([
      makeCompilationErrorEntry('INVALID_COMPILE_INPUT', null, 'artifacts', 'compile(): artifacts must be an array')
    ]);
  }

  const sources = (options && options.sources instanceof Map)
    ? createReadOnlyMap(new Map(
        [...options.sources.entries()].map(([k, v]) => [k, deepFreezeValue(deepCloneValue(v))])
      ))
    : null;

  const frozen = artifacts.map(a => deepFreezeValue(deepCloneValue(a)));

  const { registry, errors: regErrors } = buildRegistry(frozen);
  throwIfErrors(regErrors);

  const schemaErrors = validateSchema(frozen);
  throwIfErrors(schemaErrors);

  const refErrors = validateRefs(frozen, registry);
  throwIfErrors(refErrors);

  const decisionSets = buildDecisionSets(frozen, registry);

  // Phase 6: static analysis — produces warnings, never throws
  const frozenDecisionSets = createReadOnlyMap(new Map(decisionSets));
  const warnings = Object.freeze(analyzeDecisionSets(frozenDecisionSets));

  const frozenRegistry = createReadOnlyMap(new Map(registry));

  return Object.freeze({
    registry: frozenRegistry,
    decisionSets: frozenDecisionSets,
    sources,
    warnings,
  });
}

function throwIfErrors(errors) {
  if (errors && errors.length > 0) throw new CompilationError(errors);
}

module.exports = { compile };
