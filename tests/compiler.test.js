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

// ─── compile: warnings infrastructure ────────────────────────────────────────

test('compile: warnings is a frozen array on clean artifacts', () => {
  const compiled = engine.compile([RULE_NOT_FOUND, RULE_FOUND, DECISION_SET]);
  assert.ok(Array.isArray(compiled.warnings), 'warnings must be an array');
  assert.ok(Object.isFrozen(compiled.warnings), 'warnings must be frozen');
});

test('compile: clean artifacts produce no warnings', () => {
  const compiled = engine.compile([RULE_NOT_FOUND, RULE_FOUND, DECISION_SET]);
  assert.equal(compiled.warnings.length, 0);
});

// ─── compile error: INVALID_WHEN_PATH ────────────────────────────────────────

test('compile error: empty string when path', () => {
  const err = compileExpectError([
    {
      id: 'x.r', type: 'decision-rule', description: 'd',
      when: { '': 'val' },
      then: { decision: 'A', reason: 'B' },
    },
    { id: 'x', type: 'decision-set', description: 'd', version: '1', mode: 'first_match_wins',
      defaultDecision: { decision: 'A', reason: 'B' }, rules: ['r'] },
  ]);
  assert.ok(hasError(err, 'INVALID_WHEN_PATH'), 'empty string path must fail');
});

test('compile error: dot-only when path "."', () => {
  const err = compileExpectError([
    {
      id: 'x.r', type: 'decision-rule', description: 'd',
      when: { '.': 'val' },
      then: { decision: 'A', reason: 'B' },
    },
    { id: 'x', type: 'decision-set', description: 'd', version: '1', mode: 'first_match_wins',
      defaultDecision: { decision: 'A', reason: 'B' }, rules: ['r'] },
  ]);
  assert.ok(hasError(err, 'INVALID_WHEN_PATH'), 'dot-only path must fail');
});

test('compile error: double-dot when path "a..b"', () => {
  const err = compileExpectError([
    {
      id: 'x.r', type: 'decision-rule', description: 'd',
      when: { 'a..b': 'val' },
      then: { decision: 'A', reason: 'B' },
    },
    { id: 'x', type: 'decision-set', description: 'd', version: '1', mode: 'first_match_wins',
      defaultDecision: { decision: 'A', reason: 'B' }, rules: ['r'] },
  ]);
  assert.ok(hasError(err, 'INVALID_WHEN_PATH'), 'double-dot path must fail');
});

test('compile error: trailing dot when path "a."', () => {
  const err = compileExpectError([
    {
      id: 'x.r', type: 'decision-rule', description: 'd',
      when: { 'a.': 'val' },
      then: { decision: 'A', reason: 'B' },
    },
    { id: 'x', type: 'decision-set', description: 'd', version: '1', mode: 'first_match_wins',
      defaultDecision: { decision: 'A', reason: 'B' }, rules: ['r'] },
  ]);
  assert.ok(hasError(err, 'INVALID_WHEN_PATH'), 'trailing dot path must fail');
});

test('compile: valid when paths accepted', () => {
  // single segment, two segments, numeric segment
  const rule = {
    id: 'x.r', type: 'decision-rule', description: 'd',
    when: { 'status': 'A', 'payment.status': 'B', 'items.0': 'C' },
    then: { decision: 'A', reason: 'B' },
  };
  const ds = { id: 'x', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins', defaultDecision: { decision: 'A', reason: 'B' }, rules: ['r'] };
  assert.doesNotThrow(() => engine.compile([rule, ds]));
});

// ─── compile error: INVALID_REQUIRED_FACT_PATH ───────────────────────────────

test('compile error: requiredFacts path with empty segment', () => {
  const err = compileExpectError([
    RULE_NOT_FOUND, RULE_FOUND,
    { ...DECISION_SET, requiredFacts: ['abs.findResult', 'bad..path'] },
  ]);
  assert.ok(hasError(err, 'INVALID_REQUIRED_FACT_PATH'), 'double-dot in requiredFacts must fail');
});

// ─── compile warning: UNREACHABLE_RULE ───────────────────────────────────────

test('compile warning: UNREACHABLE_RULE when earlier rule subsumes later rule', () => {
  // R1: { status: "PAID" }  — general rule
  // R2: { status: "PAID", country: "RU" }  — unreachable: R1 fires first for any input matching R2
  const r1 = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: { 'status': 'PAID' },
    then: { decision: 'APPROVE', reason: 'PAID' },
  };
  const r2 = {
    id: 'ds.r2', type: 'decision-rule', description: 'r2',
    when: { 'status': 'PAID', 'country': 'RU' },
    then: { decision: 'APPROVE_RESTRICTED', reason: 'PAID_RU' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1', 'r2'],
  };
  const compiled = engine.compile([r1, r2, ds]);
  const w = compiled.warnings.find(w => w.code === 'UNREACHABLE_RULE');
  assert.ok(w, 'expected UNREACHABLE_RULE warning');
  assert.ok(w.message.includes('ds.r2'), 'message should name the unreachable rule');
  assert.ok(w.message.includes('ds.r1'), 'message should name the subsuming rule');
});

test('compile warning: no UNREACHABLE_RULE for mutually exclusive rules', () => {
  const r1 = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: { 'status': 'PENDING' },
    then: { decision: 'WAIT', reason: 'PENDING' },
  };
  const r2 = {
    id: 'ds.r2', type: 'decision-rule', description: 'r2',
    when: { 'status': 'PAID' },
    then: { decision: 'APPROVE', reason: 'PAID' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1', 'r2'],
  };
  const compiled = engine.compile([r1, r2, ds]);
  assert.equal(compiled.warnings.filter(w => w.code === 'UNREACHABLE_RULE').length, 0);
});

test('compile warning: no UNREACHABLE_RULE when later rule is more specific but earlier is not a superset', () => {
  // R1: { a: 1, b: 2 }  R2: { a: 1, c: 3 }  — R1 is NOT a subset of R2 (b vs c)
  const r1 = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: { 'a': 1, 'b': 2 },
    then: { decision: 'X', reason: 'X' },
  };
  const r2 = {
    id: 'ds.r2', type: 'decision-rule', description: 'r2',
    when: { 'a': 1, 'c': 3 },
    then: { decision: 'Y', reason: 'Y' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1', 'r2'],
  };
  const compiled = engine.compile([r1, r2, ds]);
  assert.equal(compiled.warnings.filter(w => w.code === 'UNREACHABLE_RULE').length, 0);
});

test('compile warning: UNREACHABLE_RULE — identical rules', () => {
  const r1 = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: { 'x': 'A' },
    then: { decision: 'X', reason: 'X' },
  };
  const r2 = {
    id: 'ds.r2', type: 'decision-rule', description: 'r2',
    when: { 'x': 'A' },
    then: { decision: 'Y', reason: 'Y' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1', 'r2'],
  };
  const compiled = engine.compile([r1, r2, ds]);
  assert.ok(compiled.warnings.some(w => w.code === 'UNREACHABLE_RULE'));
});

// ─── compile warning: PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS ──────────────────

test('compile warning: PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS when path not declared', () => {
  const rule = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: { 'status': 'PAID' },
    then: { decision: 'ENRICH', reason: 'PAID', patchPlanFrom: 'diff.fillableFields' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    requiredFacts: ['status'],   // diff.fillableFields NOT declared
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1'],
  };
  const compiled = engine.compile([rule, ds]);
  const w = compiled.warnings.find(w => w.code === 'PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS');
  assert.ok(w, 'expected PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS warning');
  assert.ok(w.message.includes('diff.fillableFields'));
});

test('compile warning: no PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS when path is declared', () => {
  const rule = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: { 'status': 'PAID' },
    then: { decision: 'ENRICH', reason: 'PAID', patchPlanFrom: 'diff.fillableFields' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    requiredFacts: ['status', 'diff.fillableFields'],  // declared ✓
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1'],
  };
  const compiled = engine.compile([rule, ds]);
  assert.equal(
    compiled.warnings.filter(w => w.code === 'PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS').length, 0
  );
});

test('compile warning: no PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS when requiredFacts is empty and no patchPlanFrom', () => {
  const compiled = engine.compile([RULE_NOT_FOUND, RULE_FOUND, DECISION_SET]);
  assert.equal(
    compiled.warnings.filter(w => w.code === 'PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS').length, 0
  );
});

// ─── compile warning: UNUSED_REQUIRED_FACT ───────────────────────────────────

test('compile warning: UNUSED_REQUIRED_FACT when declared path never used in when', () => {
  const rule = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: { 'status': 'PAID' },
    then: { decision: 'GO', reason: 'PAID' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    requiredFacts: ['status', 'extra.unused'],  // extra.unused never in any when
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1'],
  };
  const compiled = engine.compile([rule, ds]);
  const w = compiled.warnings.find(w => w.code === 'UNUSED_REQUIRED_FACT');
  assert.ok(w, 'expected UNUSED_REQUIRED_FACT warning');
  assert.ok(w.message.includes('extra.unused'));
});

test('compile warning: no UNUSED_REQUIRED_FACT when all required facts are used in when', () => {
  const rule = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: { 'status': 'PAID', 'country': 'RU' },
    then: { decision: 'GO', reason: 'PAID' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    requiredFacts: ['status', 'country'],
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1'],
  };
  const compiled = engine.compile([rule, ds]);
  assert.equal(compiled.warnings.filter(w => w.code === 'UNUSED_REQUIRED_FACT').length, 0);
});

test('compile warning: warning entry has expected fields', () => {
  const r1 = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: { 'x': 'A' },
    then: { decision: 'X', reason: 'X' },
  };
  const r2 = {
    id: 'ds.r2', type: 'decision-rule', description: 'r2',
    when: { 'x': 'A', 'y': 'B' },
    then: { decision: 'Y', reason: 'Y' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1', 'r2'],
  };
  const compiled = engine.compile([r1, r2, ds]);
  const w = compiled.warnings.find(w => w.code === 'UNREACHABLE_RULE');
  assert.ok(w);
  assert.deepEqual(Object.keys(w).sort(), ['artifactId', 'code', 'message', 'path']);
  assert.equal(typeof w.code, 'string');
  assert.equal(typeof w.message, 'string');
});

// ─── compile warning: UNREACHABLE_RULE — empty when subsumes all following ───

test('compile warning: UNREACHABLE_RULE — empty when:{} subsumes all following rules', () => {
  const r1 = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: {},                        // matches anything — universal rule
    then: { decision: 'CATCH_ALL', reason: 'ALWAYS' },
  };
  const r2 = {
    id: 'ds.r2', type: 'decision-rule', description: 'r2',
    when: { status: 'PAID' },        // unreachable: r1 always fires first
    then: { decision: 'PAID', reason: 'PAID' },
  };
  const r3 = {
    id: 'ds.r3', type: 'decision-rule', description: 'r3',
    when: { status: 'FAILED', country: 'RU' },
    then: { decision: 'FAIL', reason: 'FAIL' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1', 'r2', 'r3'],
  };
  const compiled = engine.compile([r1, r2, r3, ds]);
  const unreachable = compiled.warnings.filter(w => w.code === 'UNREACHABLE_RULE');
  assert.equal(unreachable.length, 2, 'both r2 and r3 must be flagged unreachable');
  assert.ok(unreachable.some(w => w.message.includes('ds.r2')));
  assert.ok(unreachable.some(w => w.message.includes('ds.r3')));
});

test('compile warning: no UNREACHABLE_RULE when empty when is last', () => {
  // empty when at the END is a legitimate "catch-all default via rule"
  const r1 = {
    id: 'ds.r1', type: 'decision-rule', description: 'r1',
    when: { status: 'PAID' },
    then: { decision: 'PAID', reason: 'PAID' },
  };
  const r2 = {
    id: 'ds.r2', type: 'decision-rule', description: 'r2',
    when: {},    // catch-all at end — only reached when r1 doesn't match
    then: { decision: 'CATCH_ALL', reason: 'ALWAYS' },
  };
  const ds = {
    id: 'ds', type: 'decision-set', description: 'd', version: '1',
    mode: 'first_match_wins',
    defaultDecision: { decision: 'X', reason: 'Y' },
    rules: ['r1', 'r2'],
  };
  const compiled = engine.compile([r1, r2, ds]);
  assert.equal(compiled.warnings.filter(w => w.code === 'UNREACHABLE_RULE').length, 0);
});
