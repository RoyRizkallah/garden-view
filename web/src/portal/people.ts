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

/** `post` is where a member is stationed, for teams split by post (security: each block, the garage). */
export type TeamMember = { name?: string; phone?: string; photo?: string; post?: string };

/** One empty place per person, until their details are known. */
const places = (count: number, post?: string): TeamMember[] => Array.from({ length: count }, () => ({ post }));

/**
 * The team that runs the building day to day. Each group has one place per person; fill in
 * a member's name and phone (and a photo path, if there is one) when they are known, e.g.
 * replace `...places(3, 'Block A')` with
 * `{ name: 'Georges', phone: '+961 70 000 000', post: 'Block A' }, ...places(2, 'Block A')`.
 * Security has a fixed number of guards at each post: three per block and three at the garage.
 */
export const TEAM_GROUPS: { role: string; singular: string; plural: string; members: TeamMember[] }[] = [
  {
    role: 'Security',
    singular: 'guard',
    plural: 'guards',
    members: [...places(3, 'Block A'), ...places(3, 'Block B'), ...places(3, 'Block C'), ...places(3, 'Garage')],
  },
  { role: 'Cleaning', singular: 'cleaner', plural: 'cleaners', members: places(2) },
  { role: 'Concierge', singular: 'concierge', plural: 'concierges', members: places(2) },
];
