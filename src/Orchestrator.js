/**
 * Orchestrator — wires intake -> pool-check -> digest, owns the daily
 * time-driven trigger, and installs the "Run now" custom menu item.
 *
 * One combined run: intake first (so newly-arrived Certificates show up in the
 * pool-check that immediately follows), then pool-check, then one digest that
 * summarises everything. The digest is sent only when something happened — a
 * silent run leaves the tutor's inbox alone. Built in Slice 5 (#6).
 */

/** Pacific-time hour the daily trigger fires (early morning). */
const DAILY_TRIGGER_HOUR = 6;

/**
 * One combined run: intake, then pool-check, then digest.
 *
 * @param {Date} [runDate] the date passed to pool-check (invoice date + year
 *   for the invoice-number allocation). Defaults to now.
 * @returns {{
 *   certificatesEntered: Array<object>,
 *   certificatesFlagged: Array<object>,
 *   invoicesDrafted: Array<object>
 * }} the combined run result, the same value handed to DigestBuilder
 */
function runAll(runDate) {
  const now = runDate || new Date();

  const intakeResult = Intake.runIntake();
  const poolResult = PoolCheck.runPoolCheck(now);

  const runResult = {
    certificatesEntered: intakeResult.entered,
    certificatesFlagged: intakeResult.flagged,
    invoicesDrafted: poolResult.drafted,
  };

  const digest = DigestBuilder.build(runResult);
  if (digest) {
    const to = ConfigGateway.getTutorEmail();
    if (to) {
      DigestMailer.sendDigest({ to: to, subject: digest.subject, body: digest.body });
    }
  }

  return runResult;
}

/**
 * Adds the "Lamp Post Tutoring" custom menu. Apps Script calls this on Sheet
 * open. `Migration dry run` (Slice 6, #7) is read-only and safe to invoke
 * during go-live to validate carryover entries before the daily trigger runs.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Lamp Post Tutoring')
    .addItem('Run now', 'runAll')
    .addItem('Migration dry run', 'migrationDryRun')
    .addToUi();
}

/**
 * Installs the daily time-driven trigger (early morning Pacific). Idempotent:
 * removes any existing `runAll` trigger first so re-running this from the Apps
 * Script editor never stacks duplicates.
 */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runAll') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('runAll')
    .timeBased()
    .atHour(DAILY_TRIGGER_HOUR)
    .everyDays(1)
    .inTimezone('America/Los_Angeles')
    .create();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAll, onOpen, installDailyTrigger };
}
