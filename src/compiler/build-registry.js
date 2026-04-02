'use strict';

const { makeCompilationErrorEntry } = require('../errors');

/**
 * Phase 1: buildRegistry
 * Collects all artifacts into a Map, validates required common fields,
 * rejects duplicates. Fail-fast: other phases depend on a clean registry.
 */
function buildRegistry(artifacts) {
  const registry = new Map();
  const errors = [];

  for (const a of artifacts) {
    if (!a || typeof a !== 'object') {
      errors.push(makeCompilationErrorEntry(
        'INVALID_ARTIFACT',
        null,
        null,
        'Artifact must be a non-null object'
      ));
      continue;
    }
    if (typeof a.id !== 'string' || !a.id) {
      errors.push(makeCompilationErrorEntry(
        'MISSING_ID',
        null,
        'id',
        'Artifact must have a non-empty string id'
      ));
      continue;
    }
    if (typeof a.type !== 'string' || !a.type) {
      errors.push(makeCompilationErrorEntry(
        'MISSING_TYPE',
        a.id,
        'type',
        'Missing required field "type"'
      ));
      continue;
    }
    if (typeof a.description !== 'string' || !a.description) {
      errors.push(makeCompilationErrorEntry(
        'MISSING_DESCRIPTION',
        a.id,
        'description',
        'Missing required non-empty field "description"'
      ));
      continue;
    }
    if (registry.has(a.id)) {
      errors.push(makeCompilationErrorEntry(
        'DUPLICATE_ID',
        a.id,
        'id',
        'Duplicate artifact id'
      ));
      continue;
    }
    registry.set(a.id, a);
  }

  return { registry, errors };
}

module.exports = { buildRegistry };
