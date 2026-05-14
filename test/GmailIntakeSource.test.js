/**
 * GmailIntakeSource.findCertificateEmails — Slice 3 (#4) go-live-date filter.
 *
 * I/O module: `GmailApp` is a file-scope global in Apps Script. The test fakes
 * it with one thread of canned messages and asserts the date filtering. The
 * exact-date re-check is the source of truth; the `after:` query bound is only
 * a fetch optimisation.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const CERT_SUBJECT = 'Enrichment Order 2026-MVA-H0061403 (CERTIFICATE)';

function msg(subject, date) {
  return { getSubject: () => subject, getDate: () => date };
}

let searched;
let thread;
global.GmailApp = {
  search(query) {
    searched = query;
    return [{ getMessages: () => thread }];
  },
};

const GmailIntakeSource = require('../src/GmailIntakeSource.js');

test('emails dated on or before the go-live date are not returned', () => {
  const goLive = new Date('2026-05-01T00:00:00Z');
  thread = [
    msg(CERT_SUBJECT, new Date('2026-04-30T12:00:00Z')), // before
    msg(CERT_SUBJECT, goLive), // exactly on
    msg(CERT_SUBJECT, new Date('2026-05-02T12:00:00Z')), // after
  ];

  const found = GmailIntakeSource.findCertificateEmails(goLive);

  assert.equal(found.length, 1);
  assert.equal(found[0].getDate().toISOString(), '2026-05-02T12:00:00.000Z');
});

test('the go-live date is pushed into the Gmail query as an after: bound', () => {
  thread = [];

  GmailIntakeSource.findCertificateEmails(new Date('2026-05-01T12:00:00Z'));

  assert.match(searched, /after:\d{4}\/\d{1,2}\/\d{1,2}/);
});

test('without a go-live date every certificate email is returned and no after: bound is set', () => {
  thread = [msg(CERT_SUBJECT, new Date('2020-01-01'))];

  const found = GmailIntakeSource.findCertificateEmails();

  assert.equal(found.length, 1);
  assert.doesNotMatch(searched, /after:/);
});

test('non-certificate subjects from the same sender are ignored', () => {
  thread = [
    msg('Enrichment Order 2026-MVA-H0061403 (RECEIPT)', new Date('2026-06-01')),
    msg(CERT_SUBJECT, new Date('2026-06-01')),
  ];

  const found = GmailIntakeSource.findCertificateEmails(new Date('2026-01-01'));

  assert.equal(found.length, 1);
  assert.equal(found[0].getSubject(), CERT_SUBJECT);
});
