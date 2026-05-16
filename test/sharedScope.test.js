/**
 * Shared-global-scope smoke test.
 *
 * Apps Script loads every `.gs` file into ONE shared global scope, so a
 * duplicate top-level `const` / `let` / `class` in two files is a SyntaxError
 * that aborts the entire project at load time. When that happens `onOpen`
 * never runs, the Lamp Post Tutoring menu vanishes, and the daily trigger
 * silently breaks too.
 *
 * Slice 9 (#20) shipped exactly this regression: both `InvoiceDocBuilder.js`
 * and `EarlyInvoice.js` declared `const SERVICE_PERIOD_SEPARATOR` at the top
 * level. The per-file `require()` calls in every other test suite isolate
 * each module in its own CommonJS scope, so the collision didn't surface in
 * `npm test`.
 *
 * This file plugs the gap: it concatenates every `src/*.js` and evaluates
 * them in a single VM context with the Apps Script-side globals stubbed.
 * A duplicate top-level declaration (or a missing identifier referenced at
 * load time) shows up here as a SyntaxError or ReferenceError. The earlier
 * `moduleShape.test.js` covers a different shape (object-vs-bare-function
 * exposure); this one covers cross-file identifier collisions.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC_DIR = path.join(__dirname, '..', 'src');

function srcFiles() {
  return fs
    .readdirSync(SRC_DIR)
    .filter(function (name) {
      return name.endsWith('.js');
    })
    .map(function (name) {
      return path.join(SRC_DIR, name);
    });
}

// Stub the Apps Script globals referenced inside function bodies. They're not
// invoked at load time, but the function declarations themselves are parsed,
// and a top-level reference to one (none currently, but defensive) would need
// it to resolve. The stubs are no-ops; tests that need behaviour stub these
// per-file in their own suites.
function appsScriptGlobalsStub() {
  const noop = function () {};
  const passthrough = new Proxy(noop, { get: () => passthrough, apply: () => passthrough });
  return {
    SpreadsheetApp: passthrough,
    DriveApp: passthrough,
    DocumentApp: passthrough,
    GmailApp: passthrough,
    HtmlService: passthrough,
    UrlFetchApp: passthrough,
    Utilities: passthrough,
    Session: passthrough,
    Logger: passthrough,
    ScriptApp: passthrough,
    PropertiesService: passthrough,
  };
}

test('every src/*.js loads together in one shared global scope (mirrors Apps Script V8)', () => {
  const files = srcFiles();
  const concatenated = files
    .map(function (file) {
      // Prefix each chunk with a marker so a SyntaxError surfaces with a
      // useful filename even though it's run as one script.
      return '// === ' + path.basename(file) + ' ===\n' + fs.readFileSync(file, 'utf8');
    })
    .join('\n\n');

  const context = vm.createContext(appsScriptGlobalsStub());
  assert.doesNotThrow(
    function () {
      vm.runInContext(concatenated, context, { filename: 'src-bundle.js' });
    },
    'top-level identifier collision or load-time error across src/*.js — ' +
      'this would break onOpen in the deployed Sheet'
  );
});
