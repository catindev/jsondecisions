'use strict';

function makeCompilationErrorEntry(code, artifactId, path, message) {
  return Object.freeze({
    code,
    artifactId: artifactId ?? null,
    path: path ?? null,
    message,
  });
}

function formatCompilationErrorEntry(entry) {
  const prefix = [];
  if (entry.code) prefix.push('[' + entry.code + ']');
  if (entry.artifactId) prefix.push(entry.artifactId);
  if (entry.path) prefix.push('(' + entry.path + ')');
  const head = prefix.join(' ');
  return (head ? head + ': ' : '') + entry.message;
}

class CompilationError extends Error {
  constructor(errors) {
    const list = errors.map((e, i) => '  ' + (i + 1) + '. ' + formatCompilationErrorEntry(e)).join('\n');
    super('jsondecisions compilation failed:\n' + list);
    this.name = 'CompilationError';
    this.errors = errors;
  }
}

/**
 * Warnings have the same shape as errors but never throw.
 * They are returned in CompiledDecisions.warnings and indicate
 * likely rule authoring mistakes discovered at compile time.
 */
function makeCompilationWarningEntry(code, artifactId, path, message) {
  return Object.freeze({
    code,
    artifactId: artifactId ?? null,
    path: path ?? null,
    message,
  });
}

module.exports = {
  CompilationError,
  makeCompilationErrorEntry,
  formatCompilationErrorEntry,
  makeCompilationWarningEntry,
};
