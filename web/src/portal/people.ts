/** Chairman's WhatsApp. Booking requests open a chat with this number. */
export const ANTHONY_WHATSAPP = '96171991999';

export const PEOPLE = [
  {
    role: 'Chairman & President',
    name: 'Anthony Aour',
    phone: '+961 71 991 999',
    lead: true,
    photo: '/images/people/anthony-aour.jpg',
  },
  { role: 'Manager', name: 'Elias Hanna', phone: '+961 3 121 411', lead: false },
  { role: 'Assistant', name: 'Tima', phone: '+961 76 446 160', lead: false },
] as const;

export type TeamMember = { name?: string; phone?: string; photo?: string };

/** One empty place per person, until their details are known. */
const places = (count: number): TeamMember[] => Array.from({ length: count }, () => ({}));

/**
 * The team that runs the building day to day. Each group has one place per person; fill in
 * a member's name and phone (and a photo path, if there is one) when they are known, e.g.
 * replace `...places(9)` with `{ name: 'Georges', phone: '+961 70 000 000' }, ...places(8)`.
 * Each person also has a spot in the garden (GARDEN_SPOTS in pages/People.tsx); a group that
 * grows needs a spot added there to appear in the garden (the phone list shows everyone).
 */
export const TEAM_GROUPS: { role: string; singular: string; plural: string; members: TeamMember[] }[] = [
  { role: 'Security', singular: 'guard', plural: 'guards', members: places(9) },
  { role: 'Cleaning', singular: 'cleaner', plural: 'cleaners', members: places(2) },
  { role: 'Concierge', singular: 'concierge', plural: 'concierges', members: places(1) },
];
