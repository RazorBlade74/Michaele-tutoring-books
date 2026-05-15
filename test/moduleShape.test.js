/**
 * Module-shape smoke test.
 *
 * In Apps Script every `.gs` file shares one global scope, so the Orchestrator
 * calls collaborators as `Intake.runIntake()` / `PoolCheck.runPoolCheck()`. Each
 * module must therefore expose its public interface as an object with the
 * expected method on it. Go-live almost failed because Intake and PoolCheck
 * declared their entry points as bare top-level functions while the unit tests
 * (which mock those collaborators) didn't catch the gap. This file is the
 * minimum gate against regressing.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const intakeModule = require('../src/Intake.js');
const poolCheckModule = require('../src/PoolCheck.js');

test('Intake module exposes Intake.runIntake', () => {
  assert.equal(typeof intakeModule.Intake, 'object');
  assert.equal(typeof intakeModule.Intake.runIntake, 'function');
});

test('PoolCheck module exposes PoolCheck.runPoolCheck', () => {
  assert.equal(typeof poolCheckModule.PoolCheck, 'object');
  assert.equal(typeof poolCheckModule.PoolCheck.runPoolCheck, 'function');
});
