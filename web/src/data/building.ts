export const BUILDING_FACTS = {
  name: 'Garden View',
  location: 'Beirut Central District',
  units: 41,
  blocks: 3,
  levels: 9,
};

// `tag` is the small eyebrow-style label, `caption` the bold line underneath — matches the
// two-tier caption style on the gallery cards. `category` drives the filter tabs; every real
// photo we have today is an exterior shot, so Interiors/Amenities/Views stay empty until real
// photography for those exists (see the note on the gallery page).
export const GALLERY_IMAGES = [
  {
    src: '/images/exterior-01.jpg',
    tag: 'Garden View Residences',
    caption: 'Architectural Elegance in Beirut Central District',
    category: 'exterior',
  },
  {
    src: '/images/exterior-07.jpg',
    tag: 'Landscaped Courtyard',
    caption: 'Green Space at Ground Level',
    category: 'exterior',
  },
  {
    src: '/images/entrance-01.jpg',
    tag: 'Main Entrance',
    caption: 'Covered Arrival Court',
    category: 'exterior',
  },
  {
    src: '/images/exterior-03.jpg',
    tag: 'Facade Detail',
    caption: 'Private Balconies',
    category: 'exterior',
  },
  {
    src: '/images/exterior-09.jpg',
    tag: 'Building Silhouette',
    caption: 'Against the Beirut Skyline',
    category: 'exterior',
  },
  {
    src: '/images/exterior-02.jpg',
    tag: 'Balcony Greenery',
    caption: 'Planted Terraces',
    category: 'exterior',
  },
  {
    src: '/images/exterior-05.jpg',
    tag: 'Street-Level View',
    caption: 'Corner Approach',
    category: 'exterior',
  },
  {
    src: '/images/exterior-04.jpg',
    tag: 'Corner Elevation',
    caption: 'Morning Light',
    category: 'exterior',
  },
  {
    src: '/images/exterior-10.jpg',
    tag: 'Facade',
    caption: 'Midday Light',
    category: 'exterior',
  },
  {
    src: '/images/exterior-06.jpg',
    tag: 'Ground Floor',
    caption: 'Frontage & Landscaping',
    category: 'exterior',
  },
  {
    src: '/images/exterior-11.jpg',
    tag: 'Upper Floors',
    caption: 'Facade Rhythm',
    category: 'exterior',
  },
  {
    src: '/images/exterior-08.jpg',
    tag: 'Tree-Lined Street',
    caption: 'Street Front',
    category: 'exterior',
  },
];

export const GALLERY_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'exterior', label: 'Exterior' },
  { key: 'interiors', label: 'Interiors' },
  { key: 'amenities', label: 'Amenities' },
  { key: 'views', label: 'Views' },
];

// Categories per the project spec's assumed feature set (Section 3.2). Hours and rules are
// still pending from building management — see the note on the Amenities page.
// Fitness & Pool, Landscaped Grounds, Parking and Building Access use the client's professional
// shoot (web/public/images/shoot/). Rooftop and Residents' Lounge still use stock photography
// standing in for spaces the shoot didn't cover (illustrative, not actual Garden View spaces).
// The first entry is the page's featured tile, so it has to be a real space.
export const AMENITY_CATEGORIES = [
  {
    icon: 'dumbbell',
    title: 'Fitness & Pool',
    description: 'A residents’ fitness studio laid out along an indoor pool.',
    image: '/images/shoot/gym-2.jpg',
    link: '/gallery#fitness',
  },
  {
    icon: 'leaf',
    title: 'Rooftop',
    description: 'A shared rooftop space for residents.',
    image: '/images/amenity-rooftop.jpg',
  },
  {
    icon: 'sofa',
    title: "Residents' Lounge",
    description: 'A shared indoor space for residents to gather.',
    image: '/images/amenity-lounge.jpg',
  },
  {
    icon: 'leaf',
    title: 'Landscaped Grounds',
    description: 'A private planted garden and street-level greenery around the building.',
    image: '/images/shoot/common-3.jpg',
  },
  {
    icon: 'car',
    title: 'Parking',
    description: 'Underground parking behind barrier-controlled entry.',
    image: '/images/shoot/common-5.jpg',
  },
  {
    icon: 'shield',
    title: 'Building Access',
    description: 'Controlled entrance access, watched over from a CCTV security room.',
    image: '/images/shoot/common-2.jpg',
  },
] as const;

export const LIFESTYLE_HIGHLIGHTS = [
  { icon: 'leaf', title: 'Shared Outdoor Space', description: 'Rooftop and courtyard access for residents.' },
  { icon: 'shield', title: 'Controlled Access', description: 'Managed entrance for residents and visitors.' },
  { icon: 'car', title: 'On-site Parking', description: 'Parking available on the property.' },
  { icon: 'sofa', title: "Residents' Lounge", description: 'Shared indoor space to gather.' },
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
