/**
 * CertificateNumber (pure) — parses `MVA-{studentId}-C{seq}` into its parts.
 *
 * `seq` is sequential per Student and never reused, so it alone is the total
 * FIFO receipt order. Built in Slice 2 (#3).
 */
const CertificateNumber = {
  /**
   * @param {string} certificateNumber e.g. "MVA-128651-C006"
   * @returns {{ studentId: string, seq: number }}
   */
  parse(certificateNumber) {
    throw new Error('CertificateNumber.parse not implemented — Slice 2 (#3)');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CertificateNumber;
}
