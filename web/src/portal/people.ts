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
  { role: 'Property Manager', name: 'Elias Hanna', phone: '+961 3 121 411', hours: '12pm – 3pm', lead: false },
  {
    role: 'Accounting & Residents Coordination',
    name: 'Tima Hammoud',
    phone: '+961 76 714 610',
    hours: '9am – 3pm',
    lead: false,
  },
] as const;

/**
 * `post` is where a member is stationed (security: each block, the parking, relief) and `shift`
 * their hours. From the building's staff list and guards list (November 2026).
 */
export type TeamMember = { name?: string; phone?: string; photo?: string; post?: string; shift?: string };

const guard = (name: string, post: string, shift?: string): TeamMember => ({ name, post, shift });

/**
 * The team that runs the building day to day. Security keeps three guards at each block and at the
 * parking (one per eight-hour shift), with one guard on relief. To change someone, edit their entry;
 * a phone number turns their card into a call link.
 */
export const TEAM_GROUPS: { role: string; singular: string; plural: string; members: TeamMember[] }[] = [
  {
    role: 'Security',
    singular: 'guard',
    plural: 'guards',
    members: [
      guard('Kamal Khazaal', 'Block A', '7am – 3pm'),
      guard('Bahij', 'Block A', '3pm – 11pm'),
      guard('Ramez Arnaout', 'Block A', '11pm – 7am'),
      guard('Shadi Haddad', 'Block B', '7am – 3pm'),
      guard('Ramadan Shbaro', 'Block B', '3pm – 11pm'),
      guard('Mahdi Attieh', 'Block B', '11pm – 7am'),
      guard('Mohamad Khazaal', 'Block C', '7am – 3pm'),
      guard('Imad Khalifa', 'Block C', '3pm – 11pm'),
      guard('Bilal Huwayed', 'Block C', '11pm – 7am'),
      guard('Imad Nasserdine', 'Parking', '7am – 3pm'),
      guard('Mohammad Al Hajj', 'Parking', '3pm – 11pm'),
      guard('Mostafa Haddad', 'Parking', '11pm – 7am'),
      guard('Khodor Al Hoss', 'Relief'),
    ],
  },
  {
    role: 'Cleaning',
    singular: 'cleaner',
    plural: 'cleaners',
    members: [
      { name: 'Yehya', phone: '+961 70 328 068', shift: '7am – 4pm' },
      { name: 'Khalifa', phone: '+961 76 975 447', shift: '7am – 4pm' },
      { name: 'Taleb', phone: '+961 81 045 825', shift: '7am – 4pm' },
    ],
  },
  {
    role: 'Concierge',
    singular: 'concierge',
    plural: 'concierges',
    members: [
      { name: 'Abed Al Saleh', phone: '+961 76 135 283', shift: 'Day · 7am – 7pm' },
      { name: 'Bachar Al Saleh', phone: '+961 78 760 604', shift: 'Night · 5pm – 11pm' },
    ],
  },
];
