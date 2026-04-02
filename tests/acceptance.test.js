'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createEngine } = require('../index');

const engine = createEngine();
const REF_PROJECT = process.env.JSONDECISIONS_REF_PROJECT
  ? path.resolve(process.env.JSONDECISIONS_REF_PROJECT)
  : null;

function hasRefProject() {
  return !!REF_PROJECT
    && fs.existsSync(REF_PROJECT)
    && fs.existsSync(path.join(REF_PROJECT, 'decisions'))
    && fs.existsSync(path.join(REF_PROJECT, 'fixtures'));
}

// Load all decision artifacts from ref-project
function loadArtifacts() {
  const decisionsDir = path.join(REF_PROJECT, 'decisions');
  const artifacts = [];
  walkDir(decisionsDir, (file) => {
    if (file.endsWith('.json')) {
      artifacts.push(JSON.parse(fs.readFileSync(file, 'utf8')));
    }
  });
  return artifacts;
}

function walkDir(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, cb);
    else cb(full);
  }
}

function loadFixtures() {
  const fixturesDir = path.join(REF_PROJECT, 'fixtures');
  const fixtures = [];
  walkDir(fixturesDir, (file) => {
    if (file.endsWith('.json')) {
      fixtures.push(JSON.parse(fs.readFileSync(file, 'utf8')));
    }
  });
  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

if (!hasRefProject()) {
  test('acceptance: skipped (set JSONDECISIONS_REF_PROJECT to beneficiary reference project path)', { skip: true }, () => {});
} else {
  test('acceptance: reference project compiles without errors', () => {
    const artifacts = loadArtifacts();
    assert.doesNotThrow(() => engine.compile(artifacts));
  });

  // Run each fixture as a separate test
  const artifacts = loadArtifacts();
  const compiled = engine.compile(artifacts);
  const fixtures = loadFixtures();

  for (const fixture of fixtures) {
    test('acceptance: ' + fixture.id + ' — ' + fixture.description.split('.')[0], () => {
      const result = engine.run(compiled, fixture.entrypoint, fixture.facts);
      const expect = fixture.expect;

      // status is always checked
      assert.equal(result.status, expect.status,
        'status mismatch: expected ' + expect.status + ', got ' + result.status);

      // decision (optional in expect)
      if (expect.decision !== undefined) {
        assert.equal(result.decision, expect.decision,
          'decision mismatch: expected ' + expect.decision + ', got ' + result.decision);
      }

      // reason (optional)
      if (expect.reason !== undefined) {
        assert.equal(result.reason, expect.reason,
          'reason mismatch: expected ' + expect.reason + ', got ' + result.reason);
      }

      // matchedRuleId (optional)
      if (expect.matchedRuleId !== undefined) {
        assert.equal(result.matchedRuleId, expect.matchedRuleId,
          'matchedRuleId mismatch: expected ' + expect.matchedRuleId + ', got ' + result.matchedRuleId);
      }

      // errorCode (optional, only meaningful for ABORT)
      if (expect.errorCode !== undefined) {
        assert.ok(result.error, 'expected error object to be present');
        assert.equal(result.error.code, expect.errorCode,
          'errorCode mismatch: expected ' + expect.errorCode + ', got ' + result.error.code);
      }

      // Invariant: error field absent on non-ABORT
      if (result.status !== 'ABORT') {
        assert.equal('error' in result, false,
          'error field must be absent on status ' + result.status);
      }
    });
  }
}
