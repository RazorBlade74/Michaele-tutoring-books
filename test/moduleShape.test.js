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
const earlyInvoiceModule = require('../src/EarlyInvoice.js');

test('Intake module exposes Intake.runIntake', () => {
  assert.equal(typeof intakeModule.Intake, 'object');
  assert.equal(typeof intakeModule.Intake.runIntake, 'function');
});

test('PoolCheck module exposes PoolCheck.runPoolCheck', () => {
  assert.equal(typeof poolCheckModule.PoolCheck, 'object');
  assert.equal(typeof poolCheckModule.PoolCheck.runPoolCheck, 'function');
});

test('EarlyInvoice exposes the top-level menu + google.script.run wrappers', () => {
  // The custom menu binds `openEarlyInvoiceDialog` by name, and the dialog
  // calls the three `earlyInvoiceX` wrappers via google.script.run — both
  // bindings are string-based, so a missing top-level export here would
  // surface as a runtime error in the deployed Sheet, not a test failure.
  assert.equal(typeof earlyInvoiceModule.openEarlyInvoiceDialog, 'function');
  assert.equal(typeof earlyInvoiceModule.earlyInvoiceGetStudents, 'function');
  assert.equal(typeof earlyInvoiceModule.earlyInvoiceGetCertsForStudent, 'function');
  assert.equal(typeof earlyInvoiceModule.earlyInvoiceSubmit, 'function');
});
