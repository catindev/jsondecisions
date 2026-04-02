'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, CompilationError } = require('../index');

const engine = createEngine();

const RULE_NOT_FOUND = {
  id: 'entrypoints.test.routing.not_found',
  type: 'decision-rule',
  description: 'Not found',
  when: { 'abs.findResult': 'NOT_FOUND' },
  then: { decision: 'CREATE', reason: 'NOT_FOUND' },
};

const RULE_FOUND = {
  id: 'entrypoints.test.routing.found',
  type: 'decision-rule',
  description: 'Found',
  when: { 'abs.findResult': 'FOUND' },
  then: { decision: 'BIND', reason: 'FOUND' },
};

const DECISION_SET = {
  id: 'entrypoints.test.routing',
  type: 'decision-set',
  description: 'Test routing',
  version: '1.0.0',
  mode: 'first_match_wins',
  defaultDecision: { decision: 'REJECT_TECH', reason: 'NO_MATCH' },
  rules: ['not_found', 'found'],
};

test('compile: valid artifacts', () => {
  const compiled = engine.compile([RULE_NOT_FOUND, RULE_FOUND, DECISION_SET]);
  assert.ok(compiled.decisionSets.has('entrypoints.test.routing'));
});

test('compile: scoped rule refs resolved correctly', () => {
  const compiled = engine.compile([RULE_NOT_FOUND, RULE_FOUND, DECISION_SET]);
  const ds = compiled.decisionSets.get('entrypoints.test.routing');
  assert.equal(ds.rules[0].ruleId, 'entrypoints.test.routing.not_found');
  assert.equal(ds.rules[1].ruleId, 'entrypoints.test.routing.found');
});

test('compile: compiled decision-set is frozen', () => {
  const compiled = engine.compile([RULE_NOT_FOUND, RULE_FOUND, DECISION_SET]);
  const ds = compiled.decisionSets.get('entrypoints.test.routing');
  assert.ok(Object.isFrozen(ds));
  assert.ok(Object.isFrozen(ds.rules));
});

function compileExpectError(artifacts) {
  try {
    engine.compile(artifacts);
    assert.fail('Expected CompilationError');
  } catch (e) {
    assert.ok(e instanceof CompilationError, 'Expected CompilationError, got: ' + e.constructor.name);
    return e;
  }
}

function hasError(err, code, pathContains) {
  return err.errors.some(e => e.code === code && (pathContains === undefined || String(e.path).includes(pathContains)));
}

test('compile error: missing id', () => {
  const err = compileExpectError([{ type: 'decision-rule', description: 'x' }]);
  assert.ok(hasError(err, 'MISSING_ID', 'id'));
});

test('compile error: missing description', () => {
  const err = compileExpectError([{ id: 'x', type: 'decision-rule' }]);
  assert.ok(hasError(err, 'MISSING_DESCRIPTION', 'description'));
});

test('compile error: duplicate id', () => {
  const err = compileExpectError([RULE_NOT_FOUND, RULE_NOT_FOUND]);
  assert.ok(hasError(err, 'DUPLICATE_ID', 'id'));
});

test('compile error: unknown type', () => {
  const err = compileExpectError([
    { id: 'x', type: 'unknown-type', description: 'x' },
  ]);
  assert.ok(hasError(err, 'UNKNOWN_ARTIFACT_TYPE', 'type'));
});

test('compile error: v2 when syntax (all)', () => {
  const err = compileExpectError([
    {
      id: 'x.rule',
      type: 'decision-rule',
      description: 'v2',
      when: { all: [{ fact: 'x', op: 'eq', value: 1 }] },
      then: { decision: 'A', reason: 'B' },
    },
    { id: 'x', type: 'decision-set', description: 'd', version: '1', mode: 'first_match_wins',
      defaultDecision: { decision: 'X', reason: 'Y' }, rules: ['rule'] },
  ]);
  assert.ok(hasError(err, 'UNSUPPORTED_WHEN_V2_KEY', 'when.all'));
});

test('compile error: unresolved rule ref', () => {
  const err = compileExpectError([
    RULE_NOT_FOUND,
    { ...DECISION_SET, rules: ['not_found', 'nonexistent_rule'] },
  ]);
  assert.ok(hasError(err, 'UNRESOLVED_REF', 'rules[1]'));
});

test('compile error: rule ref pointing to decision-set', () => {
  const dsAsRule = { ...DECISION_SET, id: 'entrypoints.test.routing.not_found' };
  const err = compileExpectError([dsAsRule, DECISION_SET]);
  assert.ok(hasError(err, 'REF_TARGET_WRONG_TYPE', 'rules[0]'));
});

test('compile error: mode not first_match_wins', () => {
  const err = compileExpectError([
    RULE_NOT_FOUND,
    { ...DECISION_SET, mode: 'all_match' },
  ]);
  assert.ok(hasError(err, 'INVALID_MODE', 'mode'));
});

test('compile error: missing then.decision', () => {
  const err = compileExpectError([
    { id: 'x.r', type: 'decision-rule', description: 'd', when: { x: 1 }, then: { reason: 'Y' } },
    { id: 'x', type: 'decision-set', description: 'd', version: '1', mode: 'first_match_wins',
      defaultDecision: { decision: 'A', reason: 'B' }, rules: ['r'] },
  ]);
  assert.ok(hasError(err, 'MISSING_THEN_DECISION', 'then.decision'));
});

test('compile error: invalid missingFactPolicy value', () => {
  const err = compileExpectError([
    RULE_NOT_FOUND,
    { ...DECISION_SET, missingFactPolicy: 'throw' },
  ]);
  assert.ok(hasError(err, 'INVALID_MISSING_FACT_POLICY', 'missingFactPolicy'));
});

test('compile error: strict not boolean', () => {
  const err = compileExpectError([
    RULE_NOT_FOUND, RULE_FOUND,
    { ...DECISION_SET, strict: 'yes' },
  ]);
  assert.ok(hasError(err, 'INVALID_STRICT', 'strict'));
});

test('compile: requiredFacts preserved in compiled set', () => {
  const compiled = engine.compile([
    RULE_NOT_FOUND, RULE_FOUND,
    { ...DECISION_SET, requiredFacts: ['abs.findResult', 'operation'] },
  ]);
  const ds = compiled.decisionSets.get('entrypoints.test.routing');
  assert.deepEqual([...ds.requiredFacts], ['abs.findResult', 'operation']);
});


test('compile error: then.tags elements must be non-empty strings', () => {
  const err = compileExpectError([
    {
      id: 'x.r', type: 'decision-rule', description: 'd', when: { x: 1 },
      then: { decision: 'A', reason: 'B', tags: ['ok', ''] }
    },
    { id: 'x', type: 'decision-set', description: 'd', version: '1', mode: 'first_match_wins',
      defaultDecision: { decision: 'A', reason: 'B' }, rules: ['r'] },
  ]);
  assert.ok(hasError(err, 'INVALID_TAG', 'then.tags[1]'));
});

test('compile: compiled maps are read-only façades', () => {
  const compiled = engine.compile([RULE_NOT_FOUND, RULE_FOUND, DECISION_SET]);
  assert.equal(typeof compiled.decisionSets.set, 'undefined');
  assert.equal(typeof compiled.registry.set, 'undefined');
});

test('compile error: entries are structured for CLI consumption', () => {
  const err = compileExpectError([
    RULE_NOT_FOUND,
    { ...DECISION_SET, rules: ['not_found', 'nonexistent_rule'] },
  ]);
  const entry = err.errors.find(e => e.code === 'UNRESOLVED_REF');
  assert.deepEqual(Object.keys(entry).sort(), ['artifactId', 'code', 'message', 'path']);
  assert.equal(entry.artifactId, 'entrypoints.test.routing');
  assert.equal(entry.path, 'rules[1]');
});
