'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { flattenFacts, getPath } = require('../src/utils');

test('flattenFacts: nested object', () => {
  const result = flattenFacts({ a: { b: { c: 1 } } });
  assert.deepEqual(result, { 'a.b.c': 1 });
});

test('flattenFacts: already flat', () => {
  const result = flattenFacts({ 'a.b': 1, 'c.d': 2 });
  assert.deepEqual(result, { 'a.b': 1, 'c.d': 2 });
});


test('flattenFacts: already-flat dotted key with object value stays as-is', () => {
  const nested = { a: 1 };
  const result = flattenFacts({ 'x.y': nested });
  assert.deepEqual(result, { 'x.y': { a: 1 } });
  assert.deepEqual(result['x.y'], nested);
});

test('flattenFacts: mixed nested and flat', () => {
  const result = flattenFacts({ abs: { findResult: 'FOUND' }, operation: 'REGISTER' });
  assert.deepEqual(result, { 'abs.findResult': 'FOUND', operation: 'REGISTER' });
});

test('flattenFacts: null value preserved (NOT treated as missing)', () => {
  const result = flattenFacts({ abs: { createdBy: null } });
  assert.deepEqual(result, { 'abs.createdBy': null });
});

test('flattenFacts: false and 0 preserved', () => {
  const result = flattenFacts({ diff: { fullMatch: false, count: 0 } });
  assert.deepEqual(result, { 'diff.fullMatch': false, 'diff.count': 0 });
});

test('flattenFacts: array stored as-is', () => {
  const result = flattenFacts({ diff: { fields: ['a', 'b'] } });
  assert.deepEqual(result['diff.fields'], ['a', 'b']);
});

test('flattenFacts: empty object gives empty result', () => {
  assert.deepEqual(flattenFacts({}), {});
});

test('getPath: existing key with string value', () => {
  const flat = { 'abs.findResult': 'FOUND' };
  assert.deepEqual(getPath(flat, 'abs.findResult'), { found: true, value: 'FOUND' });
});

test('getPath: existing key with null value — FOUND=true', () => {
  const flat = { 'abs.createdBy': null };
  const result = getPath(flat, 'abs.createdBy');
  assert.equal(result.found, true);
  assert.equal(result.value, null);
});

test('getPath: existing key with false value — FOUND=true', () => {
  const flat = { 'diff.fullMatch': false };
  const result = getPath(flat, 'diff.fullMatch');
  assert.equal(result.found, true);
  assert.equal(result.value, false);
});

test('getPath: missing key — FOUND=false', () => {
  const flat = { 'abs.findResult': 'FOUND' };
  assert.deepEqual(getPath(flat, 'abs.createdBy'), { found: false, value: undefined });
});

test('getPath: distinguishes null value from missing path', () => {
  const withNull = flattenFacts({ x: null });
  const withoutKey = flattenFacts({ y: 1 });

  assert.equal(getPath(withNull, 'x').found, true);   // exists with null
  assert.equal(getPath(withoutKey, 'x').found, false); // truly absent
});

// ─── detectFlatNestedConflict ─────────────────────────────────────────────────

const { detectFlatNestedConflict } = require('../src/utils');

test('detectFlatNestedConflict: returns conflicting key when flat+nested share prefix', () => {
  const result = detectFlatNestedConflict({ 'a.b': 1, a: { b: 2 } });
  assert.equal(result, 'a.b');
});

test('detectFlatNestedConflict: returns null for pure nested object', () => {
  assert.equal(detectFlatNestedConflict({ a: { b: 1 } }), null);
});

test('detectFlatNestedConflict: returns null for pure flat object', () => {
  assert.equal(detectFlatNestedConflict({ 'a.b': 1 }), null);
});

test('detectFlatNestedConflict: returns null for empty object', () => {
  assert.equal(detectFlatNestedConflict({}), null);
});

test('detectFlatNestedConflict: no conflict when nested prefix key is not an object', () => {
  // "a" exists but is a scalar, not an object — no collision
  assert.equal(detectFlatNestedConflict({ 'a.b': 1, a: 'scalar' }), null);
});

test('detectFlatNestedConflict: no conflict when nested prefix key is an array', () => {
  assert.equal(detectFlatNestedConflict({ 'a.b': 1, a: [1, 2] }), null);
});

test('detectFlatNestedConflict: no conflict when nested prefix key is null', () => {
  assert.equal(detectFlatNestedConflict({ 'a.b': 1, a: null }), null);
});

test('detectFlatNestedConflict: detects conflict when dotted key is deeper than 2 segments', () => {
  // "a.b.c" and "a" (object) → conflict on first segment "a"
  const result = detectFlatNestedConflict({ 'a.b.c': 1, a: { b: { c: 2 } } });
  assert.equal(result, 'a.b.c');
});

// ─── isPlainObject ────────────────────────────────────────────────────────────

const { isPlainObject } = require('../src/utils');

test('isPlainObject: plain object literal → true', () => {
  assert.equal(isPlainObject({ a: 1 }), true);
});

test('isPlainObject: empty object → true', () => {
  assert.equal(isPlainObject({}), true);
});

test('isPlainObject: Object.create(null) → true', () => {
  assert.equal(isPlainObject(Object.create(null)), true);
});

test('isPlainObject: null → false', () => {
  assert.equal(isPlainObject(null), false);
});

test('isPlainObject: array → false', () => {
  assert.equal(isPlainObject([]), false);
});

test('isPlainObject: Date instance → false', () => {
  assert.equal(isPlainObject(new Date()), false);
});

test('isPlainObject: Map instance → false', () => {
  assert.equal(isPlainObject(new Map()), false);
});

test('isPlainObject: RegExp instance → false', () => {
  assert.equal(isPlainObject(/x/), false);
});

test('isPlainObject: class instance → false', () => {
  class Foo {}
  assert.equal(isPlainObject(new Foo()), false);
});

test('isPlainObject: string → false', () => {
  assert.equal(isPlainObject('hello'), false);
});

test('isPlainObject: number → false', () => {
  assert.equal(isPlainObject(42), false);
});
