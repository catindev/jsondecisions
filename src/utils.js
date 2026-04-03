'use strict';

/**
 * Flatten a nested JSON object into a dot-notation key map.
 * CRITICAL: null is a valid fact value — it is NOT equivalent to a missing path.
 * Arrays are stored as-is under their key (not expanded).
 *
 * Idempotency contract:
 * - ordinary already-flat input like { "a.b": 1 } passes through unchanged
 * - top-level keys that already contain dots are treated as final flat keys and
 *   are NOT recursively expanded even if their value is an object
 */
function flattenFacts(obj, prefix, result) {
  if (prefix === undefined) prefix = '';
  if (result === undefined) result = {};

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) result[prefix] = obj;
    return result;
  }

  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const val = obj[key];
    const fullKey = prefix ? prefix + '.' + key : key;
    const topLevelAlreadyFlat = prefix === '' && key.includes('.');

    if (!topLevelAlreadyFlat && val !== null && typeof val === 'object' && !Array.isArray(val)) {
      flattenFacts(val, fullKey, result);
    } else {
      result[fullKey] = val;
    }
  }

  return result;
}

/**
 * Safe path getter for normalized (flat) facts.
 * Returns { found: true, value } if the key exists — even when value is null.
 * Returns { found: false, value: undefined } if the key is absent.
 *
 * Do NOT use value truthiness to check presence. Always use `found`.
 */
function getPath(flatFacts, path) {
  if (Object.prototype.hasOwnProperty.call(flatFacts, path)) {
    return { found: true, value: flatFacts[path] };
  }
  return { found: false, value: undefined };
}

/**
 * Detect a flat/nested key collision at the top level of a facts object.
 *
 * A collision exists when:
 *   - there is a top-level key with a dot, e.g. "a.b"
 *   - AND there is another top-level key that is its first segment, e.g. "a",
 *     whose value is a non-null plain object
 *
 * In that case flattenFacts() would produce a result that depends on the
 * iteration order of Object.keys(), which is insertion-order in V8.
 * The same logical facts with keys in different order would yield different
 * flat maps, and therefore potentially different decisions.
 *
 * Returns the first conflicting dotted key found, or null if no conflict.
 */
function detectFlatNestedConflict(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;

  const keys = Object.keys(obj);
  const dottedKeys = keys.filter(k => k.includes('.'));
  if (dottedKeys.length === 0) return null;

  const objectPrefixes = new Set(
    keys.filter(k =>
      !k.includes('.') &&
      obj[k] !== null &&
      typeof obj[k] === 'object' &&
      !Array.isArray(obj[k])
    )
  );

  for (const flat of dottedKeys) {
    const prefix = flat.split('.')[0];
    if (objectPrefixes.has(prefix)) return flat;
  }
  return null;
}

/**
 * Returns true only for plain objects — i.e. objects whose prototype is
 * Object.prototype or null (Object.create(null)).
 *
 * Rejects: Date, Map, Set, RegExp, Array, class instances, and any other
 * object with a non-standard prototype chain.
 */
function isPlainObject(val) {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function deepCloneValue(val) {
  if (Array.isArray(val)) return val.map(deepCloneValue);
  if (val !== null && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = deepCloneValue(v);
    return out;
  }
  return val;
}

function deepFreezeValue(val) {
  if (val === null || typeof val !== 'object' || Object.isFrozen(val)) return val;
  Object.freeze(val);
  if (Array.isArray(val)) {
    for (const item of val) deepFreezeValue(item);
  } else {
    for (const v of Object.values(val)) deepFreezeValue(v);
  }
  return val;
}

function createReadOnlyMap(map) {
  const readOnly = {
    get(key) { return map.get(key); },
    has(key) { return map.has(key); },
    forEach(callback, thisArg) { return map.forEach(callback, thisArg); },
    entries() { return map.entries(); },
    keys() { return map.keys(); },
    values() { return map.values(); },
    [Symbol.iterator]() { return map[Symbol.iterator](); },
  };

  Object.defineProperty(readOnly, 'size', {
    enumerable: true,
    configurable: false,
    get() { return map.size; },
  });

  return Object.freeze(readOnly);
}

module.exports = {
  flattenFacts,
  getPath,
  detectFlatNestedConflict,
  isPlainObject,
  deepCloneValue,
  deepFreezeValue,
  createReadOnlyMap,
};
