/**
 * Orchestrator.runAll — Slice 5 (#6) intake -> pool-check -> digest wiring.
 *
 * runAll is the I/O wiring module: its collaborators (Intake, PoolCheck,
 * ConfigGateway, DigestBuilder, DigestMailer) are file-scope globals in Apps
 * Script and Node sees them as globals too. The test injects fakes for each.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const DigestBuilder = require('../src/DigestBuilder.js');
global.DigestBuilder = DigestBuilder; // keep the real pure builder

let env;
global.Intake = {
  runIntake() {
    env.intakeCalls += 1;
    return { entered: env.entered, flagged: env.flagged };
  },
};
global.PoolCheck = {
  runPoolCheck(runDate) {
    env.poolCheckCalls += 1;
    env.runDatePassed = runDate;
    return { drafted: env.drafted };
  },
};
global.ConfigGateway = {
  getTutorEmail() {
    return env.tutorEmail;
  },
};
global.DigestMailer = {
  sendDigest(options) {
    env.sent.push(options);
  },
};

const { runAll, onOpen, installDailyTrigger } = require('../src/Orchestrator.js');

const RUN_DATE = new Date('2026-05-15T08:00:00Z');

test.beforeEach(() => {
  env = {
    entered: [],
    flagged: [],
    drafted: [],
    tutorEmail: 'lamp.post.tutoring@gmail.com',
    intakeCalls: 0,
    poolCheckCalls: 0,
    runDatePassed: undefined,
    sent: [],
  };
});

test('runAll runs intake before pool-check', () => {
  const order = [];
  global.Intake.runIntake = function () {
    order.push('intake');
    return { entered: env.entered, flagged: env.flagged };
  };
  global.PoolCheck.runPoolCheck = function () {
    order.push('pool-check');
    return { drafted: env.drafted };
  };

  runAll(RUN_DATE);

  assert.deepEqual(order, ['intake', 'pool-check']);
});

test('runAll threads the run date through to pool-check', () => {
  // Re-bind PoolCheck because the previous test replaced the spy.
  global.PoolCheck.runPoolCheck = function (runDate) {
    env.runDatePassed = runDate;
    return { drafted: env.drafted };
  };

  runAll(RUN_DATE);

  assert.equal(env.runDatePassed, RUN_DATE);
});

test('a run that drafted nothing and entered nothing sends no digest', () => {
  global.Intake.runIntake = function () {
    return { entered: [], flagged: [] };
  };
  global.PoolCheck.runPoolCheck = function () {
    return { drafted: [] };
  };

  runAll(RUN_DATE);

  assert.equal(env.sent.length, 0);
});

test('a run with certificates entered sends a digest to the tutor email', () => {
  global.Intake.runIntake = function () {
    return {
      entered: [{ certificateNumber: 'MVA-128651-C006', tabName: 'Monique' }],
      flagged: [],
    };
  };
  global.PoolCheck.runPoolCheck = function () {
    return { drafted: [] };
  };

  runAll(RUN_DATE);

  assert.equal(env.sent.length, 1);
  assert.equal(env.sent[0].to, 'lamp.post.tutoring@gmail.com');
  assert.match(env.sent[0].subject, /1 entered/);
  assert.match(env.sent[0].body, /MVA-128651-C006/);
});

test('a flagged-only run still sends a digest', () => {
  global.Intake.runIntake = function () {
    return {
      entered: [],
      flagged: [
        {
          reason: 'unknown-student',
          certificateNumber: 'MVA-999999-C001',
          studentId: '999999',
          attachmentName: 'mystery.pdf',
        },
      ],
    };
  };
  global.PoolCheck.runPoolCheck = function () {
    return { drafted: [] };
  };

  runAll(RUN_DATE);

  assert.equal(env.sent.length, 1);
  assert.match(env.sent[0].body, /Certificates flagged/);
});

test('a combined run sends a digest with all three sections', () => {
  global.Intake.runIntake = function () {
    return {
      entered: [{ certificateNumber: 'MVA-128651-C006', tabName: 'Monique' }],
      flagged: [
        {
          reason: 'amount-unreadable',
          certificateNumber: null,
          studentId: null,
          attachmentName: 'blurry.pdf',
        },
      ],
    };
  };
  global.PoolCheck.runPoolCheck = function () {
    return {
      drafted: [
        {
          tabName: 'Monique',
          invoiceNumber: '2026-001',
          certificateNumbers: ['MVA-128651-C006'],
          total: 25,
        },
      ],
    };
  };

  runAll(RUN_DATE);

  assert.equal(env.sent.length, 1);
  assert.match(env.sent[0].body, /Certificates entered/);
  assert.match(env.sent[0].body, /Certificates flagged/);
  assert.match(env.sent[0].body, /Invoices drafted/);
});

test('runAll skips the send when the Tutor Email setting is missing', () => {
  env.tutorEmail = '';
  global.Intake.runIntake = function () {
    return {
      entered: [{ certificateNumber: 'MVA-128651-C006', tabName: 'Monique' }],
      flagged: [],
    };
  };
  global.PoolCheck.runPoolCheck = function () {
    return { drafted: [] };
  };

  // Does not throw — the run still completes; the digest just has nowhere to go.
  assert.doesNotThrow(() => runAll(RUN_DATE));
  assert.equal(env.sent.length, 0);
});

test('onOpen adds a Lamp Post Tutoring menu with a Run now item bound to runAll', () => {
  const built = { items: [], addedToUi: false };
  global.SpreadsheetApp = {
    getUi() {
      return {
        createMenu(name) {
          built.name = name;
          return {
            addItem(label, fn) {
              built.items.push({ label: label, fn: fn });
              return this;
            },
            addToUi() {
              built.addedToUi = true;
            },
          };
        },
      };
    },
  };

  onOpen();

  assert.equal(built.name, 'Lamp Post Tutoring');
  assert.deepEqual(built.items, [
    { label: 'Run now', fn: 'runAll' },
    { label: 'Migration dry run', fn: 'migrationDryRun' },
    { label: 'Generate early invoice', fn: 'openEarlyInvoiceDialog' },
  ]);
  assert.equal(built.addedToUi, true);
});

test('installDailyTrigger creates a daily Pacific-time trigger for runAll', () => {
  const created = {};
  global.ScriptApp = {
    getProjectTriggers() {
      return [];
    },
    deleteTrigger() {},
    newTrigger(handler) {
      created.handler = handler;
      const chain = {
        timeBased() {
          return chain;
        },
        atHour(hour) {
          created.hour = hour;
          return chain;
        },
        everyDays(days) {
          created.everyDays = days;
          return chain;
        },
        inTimezone(tz) {
          created.timezone = tz;
          return chain;
        },
        create() {
          created.created = true;
        },
      };
      return chain;
    },
  };

  installDailyTrigger();

  assert.equal(created.handler, 'runAll');
  assert.equal(created.everyDays, 1);
  assert.equal(created.timezone, 'America/Los_Angeles');
  assert.ok(created.hour >= 4 && created.hour <= 9, 'fires in early Pacific morning');
  assert.equal(created.created, true);
});

test('installDailyTrigger replaces an existing runAll trigger instead of stacking', () => {
  const deleted = [];
  const existing = { getHandlerFunction: () => 'runAll', _id: 'old-trigger' };
  const unrelated = { getHandlerFunction: () => 'somethingElse', _id: 'other' };
  global.ScriptApp = {
    getProjectTriggers() {
      return [existing, unrelated];
    },
    deleteTrigger(trigger) {
      deleted.push(trigger);
    },
    newTrigger() {
      return {
        timeBased() {
          return this;
        },
        atHour() {
          return this;
        },
        everyDays() {
          return this;
        },
        inTimezone() {
          return this;
        },
        create() {},
      };
    },
  };

  installDailyTrigger();

  assert.deepEqual(deleted, [existing]);
});

test('runAll returns the combined run result', () => {
  global.Intake.runIntake = function () {
    return {
      entered: [{ certificateNumber: 'MVA-128651-C006', tabName: 'Monique' }],
      flagged: [],
    };
  };
  global.PoolCheck.runPoolCheck = function () {
    return {
      drafted: [
        {
          tabName: 'Monique',
          invoiceNumber: '2026-001',
          certificateNumbers: ['MVA-128651-C006'],
          total: 25,
        },
      ],
    };
  };

  const result = runAll(RUN_DATE);

  assert.deepEqual(result, {
    certificatesEntered: [{ certificateNumber: 'MVA-128651-C006', tabName: 'Monique' }],
    certificatesFlagged: [],
    invoicesDrafted: [
      {
        tabName: 'Monique',
        invoiceNumber: '2026-001',
        certificateNumbers: ['MVA-128651-C006'],
        total: 25,
      },
    ],
  });
});
