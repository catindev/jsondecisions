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

module.exports = {
  CompilationError,
  makeCompilationErrorEntry,
  formatCompilationErrorEntry,
};
