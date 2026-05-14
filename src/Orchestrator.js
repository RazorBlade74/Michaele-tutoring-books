/**
 * Orchestrator — wires intake -> pool-check -> digest; owns the daily
 * time-driven trigger and the "Run now" custom menu item.
 *
 * Built in Slice 5 (#6).
 */

/**
 * One combined run: intake, then pool-check, then digest.
 */
function runAll() {
  throw new Error('Orchestrator.runAll not implemented — Slice 5 (#6)');
}

/**
 * Adds the "Run now" custom menu item. Apps Script calls this on Sheet open.
 */
function onOpen() {
  throw new Error('Orchestrator.onOpen not implemented — Slice 5 (#6)');
}

/**
 * Installs the daily time-driven trigger (early morning Pacific).
 */
function installDailyTrigger() {
  throw new Error('Orchestrator.installDailyTrigger not implemented — Slice 5 (#6)');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAll, onOpen, installDailyTrigger };
}
