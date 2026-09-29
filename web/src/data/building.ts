export const BUILDING_FACTS = {
  name: 'Garden View',
  location: 'Beirut Central District',
  units: 41,
  blocks: 3,
  // ground + 10 floors above it (the as-built sheets run G, 1–10; B1–B3 are below ground)
  levels: 11,
};

// `tag` is the small eyebrow-style label, `caption` the bold line underneath. Every photo here is
// from the client's professional shoot (web/public/images/shoot/, built by scripts/build_media.py);
// the full shoot, with films, lives on the Gallery page (data/photoshoot.ts). Home shows the first
// three, Residences the first six.
export const GALLERY_IMAGES = [
  { src: '/images/shoot/block-a-1.jpg', tag: 'Block A', caption: 'Planted Façade', category: 'exterior' },
  { src: '/images/shoot/common-3.jpg', tag: 'Ground Floor', caption: 'Private Garden', category: 'amenities' },
  { src: '/images/shoot/block-a-3.jpg', tag: 'Block A', caption: 'Entrance Lobby', category: 'interiors' },
  { src: '/images/shoot/block-b-4.jpg', tag: 'Block B', caption: 'On the Street', category: 'exterior' },
  { src: '/images/shoot/gym-3.jpg', tag: 'Level B1', caption: 'Indoor Pool', category: 'amenities' },
  { src: '/images/shoot/block-c-1.jpg', tag: 'Block C', caption: 'Façade in the Trees', category: 'exterior' },
  { src: '/images/shoot/block-b-2.jpg', tag: 'Block B', caption: 'Stepped Terraces', category: 'exterior' },
  { src: '/images/shoot/block-c-2.jpg', tag: 'Block C', caption: 'Covered Entrance', category: 'exterior' },
  { src: '/images/shoot/block-b-3.jpg', tag: 'Block B', caption: 'Lobby Artwork', category: 'interiors' },
  { src: '/images/shoot/gym-2.jpg', tag: 'Level B1', caption: 'Fitness Studio', category: 'amenities' },
  { src: '/images/shoot/block-a-2.jpg', tag: 'Block A', caption: 'Planted Balconies', category: 'exterior' },
  { src: '/images/shoot/block-c-3.jpg', tag: 'Block C', caption: 'Lobby onto the Garden', category: 'interiors' },
];

// Every amenity here is one the professional shoot shows (and, where a number is given, one the
// as-built plans confirm: parking capacities are written on the B1–B3 sheets). Rooftop and
// Residents' Lounge used to be listed with stock photography; the shoot doesn't cover them, so
// they are left out until real photos exist. The first entry is the page's featured tile.
export const AMENITY_CATEGORIES = [
  {
    icon: 'dumbbell',
    title: 'Fitness & Pool',
    description: 'A residents’ fitness studio laid out along an indoor pool, lit by a skylight.',
    image: '/images/shoot/gym-2.jpg',
    link: '/gallery#fitness',
  },
  {
    icon: 'leaf',
    title: 'Private Gardens',
    description: 'Two planted gardens on the ground floor.',
    image: '/images/shoot/common-3.jpg',
  },
  {
    icon: 'building',
    title: 'Lobbies',
    description: 'Each block has its own entrance and lobby, hung with large-format artwork.',
    image: '/images/shoot/block-b-3.jpg',
  },
  {
    icon: 'car',
    title: 'Parking',
    description: '120 spaces across three underground levels.',
    image: '/images/shoot/common-5.jpg',
  },
  {
    icon: 'shield',
    title: 'Security',
    description: 'A CCTV security room and fire detection throughout.',
    image: '/images/shoot/common-2.jpg',
  },
  {
    icon: 'lamp',
    title: 'Standby Power',
    description: 'Standby generators and a central heating plant keep the building running.',
    image: '/images/shoot/common-7.jpg',
  },
] as const;

export const LIFESTYLE_HIGHLIGHTS = [
  { icon: 'leaf', title: 'Private Gardens', description: 'Two planted gardens on the ground floor.' },
  { icon: 'shield', title: 'Controlled Access', description: 'Managed entrance for residents and visitors.' },
  { icon: 'car', title: 'On-site Parking', description: '120 spaces on three underground levels.' },
  { icon: 'dumbbell', title: 'Indoor Pool', description: 'A pool and fitness studio on level B1.' },
];

// Unit counts per block are real, from the owner directory (18 + 6 + 17 = 41).
export const BLOCKS = [
  { name: 'Block A', units: 18, levels: BUILDING_FACTS.levels, image: '/images/shoot/block-a-1.jpg' },
  { name: 'Block B', units: 6, levels: BUILDING_FACTS.levels, image: '/images/shoot/block-b-4.jpg' },
  { name: 'Block C', units: 17, levels: BUILDING_FACTS.levels, image: '/images/shoot/block-c-1.jpg' },
];

export const BUILDING_HIGHLIGHTS = [
  { icon: 'shield', title: 'Private & Secure', description: '24/7 security and controlled access' },
  { icon: 'leaf', title: 'Green Living', description: 'Landscaped gardens and open spaces' },
  { icon: 'car', title: 'Parking', description: 'Secure parking for residents' },
  { icon: 'elevator', title: 'Modern Elevators', description: 'High-speed elevators in every block' },
  { icon: 'concierge', title: 'Concierge Service', description: 'Assistance for residents and visitors' },
];
