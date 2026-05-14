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
    const match = /^MVA-(\d+)-C(\d+)$/.exec(String(certificateNumber).trim());
    if (!match) {
      throw new Error(
        `CertificateNumber.parse: not a well-formed certificate number: "${certificateNumber}"`
      );
    }
    return { studentId: match[1], seq: Number(match[2]) };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CertificateNumber;
}
