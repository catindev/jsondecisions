'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../index');

const engine = createEngine();

// ─── Test fixture builder ─────────────────────────────────────────────────────

function makeRule(id, when, then) {
  return {
    id,
    type: 'decision-rule',
    description: id,
    when,
    then: { decision: 'D_' + id.split('.').pop(), reason: 'R_' + id.split('.').pop(), ...then },
  };
}

function makeSet(id, rules, opts) {
  return {
    id,
    type: 'decision-set',
    description: id,
    version: '1.0.0',
    mode: 'first_match_wins',
    defaultDecision: { decision: 'REJECT_TECH', reason: 'NO_MATCH' },
    rules,
    ...opts,
  };
}

function build(...artifacts) {
  return engine.compile(artifacts);
}

// ─── MATCHED ─────────────────────────────────────────────────────────────────

test('run: MATCHED on first rule', () => {
  const rule = makeRule('ds.r1', { 'x': 'A' }, { decision: 'GO', reason: 'MATCH' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 'A' });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.decision, 'GO');
  assert.equal(result.reason, 'MATCH');
  assert.equal(result.matchedRuleId, 'ds.r1');
});

test('run: MATCHED on second rule after first fails', () => {
  const r1 = makeRule('ds.r1', { x: 'A' }, { decision: 'FIRST', reason: 'A' });
  const r2 = makeRule('ds.r2', { x: 'B' }, { decision: 'SECOND', reason: 'B' });
  const ds = makeSet('ds', ['r1', 'r2']);
  const compiled = build(r1, r2, ds);

  const result = engine.run(compiled, 'ds', { x: 'B' });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.decision, 'SECOND');
  assert.equal(result.matchedRuleId, 'ds.r2');
});

test('run: MATCHED result has no error field', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'OK', reason: 'OK' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);
  const result = engine.run(compiled, 'ds', { x: 1 });
  assert.equal(result.status, 'MATCHED');
  assert.equal('error' in result, false, 'error field must be absent on MATCHED');
});

test('run: MATCHED with multiple when conditions (AND)', () => {
  const rule = makeRule('ds.r1', { a: 1, b: true, c: 'X' }, { decision: 'ALL', reason: 'AND' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);
  assert.equal(engine.run(compiled, 'ds', { a: 1, b: true, c: 'X' }).status, 'MATCHED');
  assert.equal(engine.run(compiled, 'ds', { a: 1, b: true, c: 'Y' }).status, 'DEFAULTED');
});

// ─── DEFAULTED ────────────────────────────────────────────────────────────────

test('run: DEFAULTED when no rule matches', () => {
  const rule = makeRule('ds.r1', { x: 'A' }, { decision: 'GO', reason: 'A' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 'NOPE' });
  assert.equal(result.status, 'DEFAULTED');
  assert.equal(result.decision, 'REJECT_TECH');
  assert.equal(result.matchedRuleId, null);
  assert.equal('error' in result, false, 'error field must be absent on DEFAULTED');
});

// ─── ABORT: unknown entrypoint ────────────────────────────────────────────────

test('run: ABORT on unknown entrypoint', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'nonexistent', { x: 1 });
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'UNKNOWN_ENTRYPOINT');
  assert.equal(result.decision, null);
});

// ─── requiredFacts (Level 1) ──────────────────────────────────────────────────

test('run: ABORT when required fact is missing', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1'], { requiredFacts: ['x', 'y'] });
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 1 }); // y missing
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'REQUIRED_FACT_MISSING');
  assert.equal(result.error.fact, 'y');
});

test('run: required fact with null value is PRESENT (not missing)', () => {
  const rule = makeRule('ds.r1', { x: null }, { decision: 'NULL_MATCH', reason: 'N' });
  const ds = makeSet('ds', ['r1'], { requiredFacts: ['x'] });
  const compiled = build(rule, ds);

  // x exists with null value → requiredFacts passes, rule should match
  const result = engine.run(compiled, 'ds', { x: null });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.decision, 'NULL_MATCH');
});

test('run: requiredFacts upfront check fires before any rule evaluation', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1'], { requiredFacts: ['missing_fact'] });
  const compiled = build(rule, ds);

  // x=1 would match r1, but missing_fact check fires first
  const result = engine.run(compiled, 'ds', { x: 1 });
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'REQUIRED_FACT_MISSING');
});

// ─── missingFactPolicy (Level 2) ──────────────────────────────────────────────

test('run: missingFactPolicy "false" treats absent path as false (rule skipped)', () => {
  const rule = makeRule('ds.r1', { x: 'A' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1'], { missingFactPolicy: 'false' });
  const compiled = build(rule, ds);

  // x absent → condition false → rule not matched → DEFAULTED
  const result = engine.run(compiled, 'ds', {});
  assert.equal(result.status, 'DEFAULTED');
});

test('run: missingFactPolicy "error" returns ABORT on absent path in when', () => {
  const rule = makeRule('ds.r1', { x: 'A' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1'], { missingFactPolicy: 'error' });
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', {});
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'MISSING_FACT');
  assert.equal(result.error.fact, 'x');
});

test('run: null value matches when condition "x": null', () => {
  const rule = makeRule('ds.r1', { x: null }, { decision: 'NULL', reason: 'N' });
  const ds = makeSet('ds', ['r1'], { missingFactPolicy: 'error' });
  const compiled = build(rule, ds);

  // x exists with null → matches "x": null, no ABORT
  assert.equal(engine.run(compiled, 'ds', { x: null }).status, 'MATCHED');
});

test('run: absent path vs null value are different with missingFactPolicy error', () => {
  const rule = makeRule('ds.r1', { x: null }, { decision: 'NULL', reason: 'N' });
  const ds = makeSet('ds', ['r1'], { missingFactPolicy: 'error' });
  const compiled = build(rule, ds);

  // x absent → ABORT (not the same as x=null)
  const result = engine.run(compiled, 'ds', {});
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'MISSING_FACT');
});

// ─── strict mode ─────────────────────────────────────────────────────────────

test('run: strict=true, no match → ABORT DEFAULT_REACHED_IN_STRICT_MODE', () => {
  const rule = makeRule('ds.r1', { x: 'A' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1'], { strict: true });
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 'NOPE' });
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'DEFAULT_REACHED_IN_STRICT_MODE');
  assert.ok('traceBeforeDefault' in result.error.details);
});

test('run: strict=false, no match → DEFAULTED (not ABORT)', () => {
  const rule = makeRule('ds.r1', { x: 'A' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1'], { strict: false });
  const compiled = build(rule, ds);

  assert.equal(engine.run(compiled, 'ds', { x: 'NOPE' }).status, 'DEFAULTED');
});

test('run: strict=true + trace=false → traceBeforeDefault is empty array', () => {
  const rule = makeRule('ds.r1', { x: 'A' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1'], { strict: true });
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 'NOPE' }, { trace: false });
  assert.equal(result.status, 'ABORT');
  assert.deepEqual(result.error.details.traceBeforeDefault, []);
});

// ─── patchPlanFrom ────────────────────────────────────────────────────────────

test('run: patchPlanFrom copies value from facts', () => {
  const rule = makeRule('ds.r1', { x: 1 }, {
    decision: 'ENRICH', reason: 'E', patchPlanFrom: 'diff.fields',
  });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 1, diff: { fields: ['a', 'b'] } });
  assert.equal(result.status, 'MATCHED');
  assert.deepEqual(result.patchPlan, ['a', 'b']);
});

test('run: patchPlanFrom absent path gives patchPlan: null (never ABORT)', () => {
  const rule = makeRule('ds.r1', { x: 1 }, {
    decision: 'ENRICH', reason: 'E', patchPlanFrom: 'diff.fields',
  });
  // Use missingFactPolicy: "error" to prove patchPlanFrom bypasses it
  const ds = makeSet('ds', ['r1'], { missingFactPolicy: 'error' });
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 1 }); // diff.fields absent
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.patchPlan, null);
});

test('run: patchPlanFrom with null value gives patchPlan: null', () => {
  const rule = makeRule('ds.r1', { x: 1 }, {
    decision: 'ENRICH', reason: 'E', patchPlanFrom: 'diff.fields',
  });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 1, diff: { fields: null } });
  assert.equal(result.patchPlan, null);
});


test('run: mutating patchPlan does not mutate source facts', () => {
  const rule = makeRule('ds.r1', { x: 1 }, {
    decision: 'ENRICH', reason: 'E', patchPlanFrom: 'diff.fields',
  });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const facts = { x: 1, diff: { fields: [{ name: 'a' }] } };
  const result = engine.run(compiled, 'ds', facts);
  result.patchPlan[0].name = 'changed';

  assert.equal(facts.diff.fields[0].name, 'a');
});

// ─── trace ────────────────────────────────────────────────────────────────────

test('run: trace contains all evaluated rules', () => {
  const r1 = makeRule('ds.r1', { x: 'A' }, { decision: 'A', reason: 'A' });
  const r2 = makeRule('ds.r2', { x: 'B' }, { decision: 'B', reason: 'B' });
  const ds = makeSet('ds', ['r1', 'r2']);
  const compiled = build(r1, r2, ds);

  const result = engine.run(compiled, 'ds', { x: 'B' });
  assert.equal(result.trace.length, 2);
  assert.equal(result.trace[0].ruleId, 'ds.r1');
  assert.equal(result.trace[0].matched, false);
  assert.equal(result.trace[1].ruleId, 'ds.r2');
  assert.equal(result.trace[1].matched, true);
});

test('run: failedConditions shows why rule did not match', () => {
  const rule = makeRule('ds.r1', { x: 'A', y: 1 }, { decision: 'X', reason: 'X' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 'B', y: 1 });
  const entry = result.trace[0];
  assert.equal(entry.matched, false);
  assert.equal(entry.failedConditions.length, 1);
  assert.equal(entry.failedConditions[0].fact, 'x');
  assert.equal(entry.failedConditions[0].expected, 'A');
  assert.equal(entry.failedConditions[0].actual, 'B');
});

test('run: absent fact in failedConditions shows __MISSING__', () => {
  const rule = makeRule('ds.r1', { x: 'A' }, { decision: 'X', reason: 'X' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', {});
  assert.equal(result.trace[0].failedConditions[0].actual, '__MISSING__');
});

test('run: trace=false returns empty trace array', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 1 }, { trace: false });
  assert.equal(result.status, 'MATCHED');
  assert.deepEqual(result.trace, []);
});

// ─── DecisionResult structure ─────────────────────────────────────────────────

test('run: DEFAULTED result has all required fields', () => {
  const rule = makeRule('ds.r1', { x: 'A' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 'NOPE' });
  assert.equal(result.status, 'DEFAULTED');
  assert.equal(result.matchedRuleId, null);
  assert.equal(result.patchPlan, null);
  assert.deepEqual(result.metadata, {});
  assert.deepEqual(result.tags, []);
  assert.ok(Array.isArray(result.trace));
  assert.equal('error' in result, false);
});

test('run: MATCHED result carries metadata and tags from then', () => {
  const rule = {
    id: 'ds.r1', type: 'decision-rule', description: 'd',
    when: { x: 1 },
    then: {
      decision: 'GO', reason: 'R',
      metadata: { scenario: '3.4' },
      tags: ['enrich_path'],
    },
  };
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { x: 1 });
  assert.deepEqual(result.metadata, { scenario: '3.4' });
  assert.deepEqual(result.tags, ['enrich_path']);
});

test('run: decisionSetVersion is always present', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = { ...makeSet('ds', ['r1']), version: '2.3.1' };
  const compiled = build(rule, ds);

  assert.equal(engine.run(compiled, 'ds', { x: 1 }).decisionSetVersion, '2.3.1');
  assert.equal(engine.run(compiled, 'ds', { x: 99 }).decisionSetVersion, '2.3.1');
});

// ─── nested facts ─────────────────────────────────────────────────────────────

test('run: nested facts are flattened transparently', () => {
  const rule = makeRule('ds.r1', { 'abs.findResult': 'FOUND', 'diff.fullMatch': true }, {
    decision: 'BIND', reason: 'MATCH',
  });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', {
    abs: { findResult: 'FOUND' },
    diff: { fullMatch: true },
  });
  assert.equal(result.status, 'MATCHED');
});

// ─── run: INVALID_FACTS_TYPE ──────────────────────────────────────────────────

test('run: ABORT INVALID_FACTS_TYPE when facts is an array', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', [1, 2, 3]);
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'INVALID_FACTS_TYPE');
});

test('run: ABORT INVALID_FACTS_TYPE when facts is a string', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', 'some string');
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'INVALID_FACTS_TYPE');
});

test('run: ABORT INVALID_FACTS_TYPE when facts is a number', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', 42);
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'INVALID_FACTS_TYPE');
});

test('run: null facts treated as empty facts (not ABORT)', () => {
  const rule = makeRule('ds.r1', { x: 'A' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  // null → {} → no fact x → DEFAULTED (not ABORT)
  const result = engine.run(compiled, 'ds', null);
  assert.equal(result.status, 'DEFAULTED');
});

test('run: undefined facts treated as empty facts (not ABORT)', () => {
  const rule = makeRule('ds.r1', { x: 'A' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', undefined);
  assert.equal(result.status, 'DEFAULTED');
});

// ─── run: CONFLICTING_FACT_PATHS ─────────────────────────────────────────────

test('run: ABORT CONFLICTING_FACT_PATHS when flat dotted key and nested object share prefix', () => {
  const rule = makeRule('ds.r1', { 'a.b': 'X' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  // "a.b" and "a" both present at top level — order-dependent
  const result = engine.run(compiled, 'ds', { 'a.b': 'X', a: { b: 'Y' } });
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'CONFLICTING_FACT_PATHS');
  assert.ok(result.error.message.includes('a.b'));
});

test('run: no conflict when only nested object (no top-level dotted key)', () => {
  const rule = makeRule('ds.r1', { 'a.b': 'X' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { a: { b: 'X' } });
  assert.equal(result.status, 'MATCHED');
});

test('run: no conflict when only flat dotted key (no nested object)', () => {
  const rule = makeRule('ds.r1', { 'a.b': 'X' }, { decision: 'A', reason: 'A' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { 'a.b': 'X' });
  assert.equal(result.status, 'MATCHED');
});

test('run: CONFLICTING_FACT_PATHS carries decisionSetVersion', () => {
  const rule = makeRule('ds.r1', { 'x.y': 1 }, { decision: 'A', reason: 'B' });
  const ds = { ...makeSet('ds', ['r1']), version: '3.0.0' };
  const compiled = build(rule, ds);

  const result = engine.run(compiled, 'ds', { 'x.y': 1, x: { y: 2 } });
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'CONFLICTING_FACT_PATHS');
  assert.equal(result.decisionSetVersion, '3.0.0');
});

// ─── run: INVALID_FACTS_TYPE — non-plain objects ──────────────────────────────

test('run: ABORT INVALID_FACTS_TYPE when facts is a Date', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);
  const result = engine.run(compiled, 'ds', new Date());
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'INVALID_FACTS_TYPE');
});

test('run: ABORT INVALID_FACTS_TYPE when facts is a Map', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);
  const result = engine.run(compiled, 'ds', new Map([['x', 1]]));
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'INVALID_FACTS_TYPE');
});

test('run: ABORT INVALID_FACTS_TYPE when facts is a RegExp', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);
  const result = engine.run(compiled, 'ds', /pattern/);
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'INVALID_FACTS_TYPE');
});

test('run: ABORT INVALID_FACTS_TYPE when facts is a class instance', () => {
  class MyFacts { constructor() { this.x = 1; } }
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);
  const result = engine.run(compiled, 'ds', new MyFacts());
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'INVALID_FACTS_TYPE');
});

test('run: plain object with Object.prototype is accepted', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);
  const result = engine.run(compiled, 'ds', { x: 1 });
  assert.equal(result.status, 'MATCHED');
});

test('run: null-prototype object (Object.create(null)) is accepted as plain object', () => {
  const rule = makeRule('ds.r1', { x: 1 }, { decision: 'A', reason: 'B' });
  const ds = makeSet('ds', ['r1']);
  const compiled = build(rule, ds);
  const facts = Object.create(null);
  facts.x = 1;
  const result = engine.run(compiled, 'ds', facts);
  assert.equal(result.status, 'MATCHED');
});
