'use strict';

const { compile } = require('./compiler/index');
const { run } = require('./runner');

/**
 * createEngine()
 *
 * Returns a decision engine with compile() and run() methods.
 * The engine has no internal state — compiled artifacts are passed explicitly.
 */
function createEngine() {
  return {
    /**
     * Compile an array of artifacts into a frozen CompiledDecisions object.
     * Throws CompilationError if any phase fails.
     *
     * @param {Array} artifacts - flat array of decision-set and decision-rule objects
     * @param {Object} [options]
     * @param {Map} [options.sources] - optional Map<id, { file, rel }> for diagnostics
     * @returns {CompiledDecisions}
     */
    compile(artifacts, options) {
      return compile(artifacts, options);
    },

    /**
     * Run a decision set against a facts object.
     * Safe to call concurrently — no shared mutable state.
     *
     * @param {CompiledDecisions} compiled
     * @param {string} entrypointId
     * @param {Object} facts - nested or flat dot-notation JSON
     * @param {Object} [options]
     * @param {boolean} [options.trace=true] - whether to collect trace entries
     * @returns {DecisionResult}
     */
    run(compiled, entrypointId, facts, options) {
      return run(compiled, entrypointId, facts, options);
    },
  };
}

module.exports = { createEngine };
