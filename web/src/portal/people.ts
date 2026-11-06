/** Chairman's WhatsApp. Booking requests open a chat with this number. */
export const ANTHONY_WHATSAPP = '96171991999';

export const PEOPLE = [
  { role: 'Chairman', name: 'Anthony Aour', phone: '+961 71 991 999', lead: true },
  { role: 'Manager', name: 'Elias Hanna', phone: '+961 3 121 411', lead: false },
  { role: 'Assistant', name: 'Tima', phone: '+961 76 446 160', lead: false },
] as const;

/** The rest of the building team. Add names here when they are ready. */
export const TEAM: { role: string; name: string; phone: string }[] = [];
