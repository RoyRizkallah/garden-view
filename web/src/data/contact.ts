// Building management's public contact details — the one place to fill them in. A detail left
// null is simply not shown anywhere on the site (no "pending" placeholders); until at least one is
// set, visitors are pointed to the enquiry form on /location, which reaches management through
// Admin -> Inquiries.
export const CONTACT: {
  /** International format, e.g. "+961 1 234 567". */
  phone: string | null;
  email: string | null;
  /** Digits only with country code, e.g. "96170123456". */
  whatsapp: string | null;
  /** Office address line, e.g. "Block A, ground floor". */
  office: string | null;
} = {
  phone: null,
  email: null,
  whatsapp: null,
  office: null,
};

export const hasDirectContact = Object.values(CONTACT).some(Boolean);
