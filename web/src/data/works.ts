import media from './works-media.json';

/**
 * Works carried out on the building, shown to residents before and after (Project Progress).
 * From building management's photo folders "Maintenance works - 1st quarter" and "Works".
 * Photos are built by scripts/build_works.py (sources in scripts/works-sources.json) into
 * /images/works/<slug>-640.webp and -1600.webp; each caption says only what the photos show.
 */
export type WorkPhoto = { slug: string; w: number; h: number };
export type WorkPair = { label?: string; before: WorkPhoto; after: WorkPhoto };
export type Work = {
  id: string;
  title: string;
  place: string;
  group: WorkGroup;
  summary: string;
  pairs: WorkPair[];
  /** further photos, for works without a before and after, or to show more */
  more: WorkPhoto[];
};
export const WORK_GROUPS = ['Maintenance, 1st quarter', 'Common areas'] as const;
export type WorkGroup = (typeof WORK_GROUPS)[number];

const sizes = media as Record<string, { w: number; h: number }>;
const photo = (slug: string): WorkPhoto => {
  const size = sizes[slug];
  if (!size) throw new Error(`works: no photo "${slug}" (run scripts/build_works.py)`);
  return { slug, ...size };
};
const pair = (base: string, label?: string): WorkPair => ({
  label,
  before: photo(`${base}-before`),
  after: photo(`${base}-after`),
});

export const workImage = (item: WorkPhoto, width: 640 | 1600) => `/images/works/${item.slug}-${width}.webp`;

export const WORKS: Work[] = [
  // ---------- Maintenance, 1st quarter ----------
  {
    id: 'generator-room-ventilation',
    title: 'Generator room ventilation',
    place: 'Generator room',
    group: 'Maintenance, 1st quarter',
    summary: 'The ventilation opening was rebuilt with new louvres and extract fans.',
    pairs: [pair('gen-room-vent')],
    more: [],
  },
  {
    id: 'chiller-pumps',
    title: 'Chiller pumps',
    place: 'Block A',
    group: 'Maintenance, 1st quarter',
    summary: 'The worn chiller pumps were taken apart and replaced with new motors.',
    pairs: [pair('chiller-pumps')],
    more: [photo('chiller-pumps-old-motor'), photo('chiller-pumps-new-motor')],
  },
  {
    id: 'water-pumps',
    title: 'Water pumps',
    place: 'Pump room, B2',
    group: 'Maintenance, 1st quarter',
    summary: 'The water pumps were replaced, with new pipework and a new control panel.',
    pairs: [pair('water-pumps')],
    more: [],
  },
  {
    id: 'roof-fans',
    title: 'Roof extract fans',
    place: 'Roof',
    group: 'Maintenance, 1st quarter',
    summary: 'Worn extract fans on the roof were replaced with new ones, and their ducts renewed.',
    pairs: [pair('roof-fans')],
    more: [photo('roof-fans-new'), photo('roof-fans-duct')],
  },
  {
    id: 'pool-filter',
    title: 'Swimming pool filter',
    place: 'Pool plant room',
    group: 'Maintenance, 1st quarter',
    summary: 'The old pool filter was replaced with a new one.',
    pairs: [pair('pool-filter')],
    more: [photo('pool-filter-pump')],
  },
  {
    id: 'generator-booster-pump',
    title: 'Generator 3 water pump',
    place: 'Generator room',
    group: 'Maintenance, 1st quarter',
    summary: 'The water booster pump on generator 3 was replaced.',
    pairs: [pair('gen-booster')],
    more: [],
  },
  {
    id: 'generator-radiators',
    title: 'Generator radiators',
    place: 'Generator room',
    group: 'Maintenance, 1st quarter',
    summary: 'New radiators were fitted to the generators.',
    pairs: [],
    more: [photo('gen-radiator-1'), photo('gen-radiator-1b'), photo('gen-radiator-2'), photo('gen-radiator-3')],
  },
  {
    id: 'gym-ac-fans',
    title: 'Gym air-conditioning fans',
    place: 'Gym',
    group: 'Maintenance, 1st quarter',
    summary: 'New blower fans for the gym’s air conditioning.',
    pairs: [],
    more: [photo('gym-ac-fans-1'), photo('gym-ac-fans-2')],
  },

  // ---------- Common areas ----------
  {
    id: 'basement-lobbies',
    title: 'Basement lift lobbies',
    place: 'Basements B1 to B3',
    group: 'Common areas',
    summary: 'Walls repaired and painted, lit ceilings fitted and the lift doors redone.',
    pairs: [pair('basement-b1', 'B1'), pair('basement-b2', 'B2'), pair('basement-b3', 'B3'), pair('basement-a-b1', 'B1, Block A')],
    more: [],
  },
  {
    id: 'elevator-floors',
    title: 'Elevator floors',
    place: 'Blocks A, B and C',
    group: 'Common areas',
    summary: 'The stone floors of the elevators were ground and polished.',
    pairs: [pair('elevator-a', 'Block A'), pair('elevator-b', 'Block B'), pair('elevator-c', 'Block C')],
    more: [],
  },
  {
    id: 'block-c-lobby',
    title: 'Block C entrance and lobby',
    place: 'Block C',
    group: 'Common areas',
    summary: 'Entrance glass redone, walls painted, new lighting, and the marble floor polished.',
    pairs: [
      pair('block-c-glass', 'Entrance glass'),
      pair('block-c-walls', 'Painting'),
      pair('block-c-lights', 'Lighting'),
      pair('block-c-floor', 'Floor'),
    ],
    more: [photo('block-c-glass-during')],
  },
  {
    id: 'block-a-lobby',
    title: 'Block A lobby',
    place: 'Block A',
    group: 'Common areas',
    summary: 'Ceiling repainted, the marble floor polished, and the glass door fittings replaced.',
    pairs: [pair('block-a-ceiling', 'Ceiling'), pair('block-a-floor', 'Floor'), pair('block-a-hinge', 'Glass door fittings')],
    more: [],
  },
  {
    id: 'block-b-lobby',
    title: 'Block B lobby',
    place: 'Block B',
    group: 'Common areas',
    summary: 'Walls and ceiling repainted, and the marble floor polished.',
    pairs: [pair('block-b-walls', 'Walls'), pair('block-b-ceiling', 'Ceiling'), pair('block-b-floor', 'Floor')],
    more: [],
  },
  {
    id: 'control-room',
    title: 'Control room',
    place: 'Block B',
    group: 'Common areas',
    summary: 'The control room was repaired and repainted.',
    pairs: [pair('control-room')],
    more: [],
  },
  {
    id: 'ac-pipes-block-c',
    title: 'Air-conditioning pipes',
    place: 'Block C',
    group: 'Common areas',
    summary: 'Corroded valves and pipe joints were replaced.',
    pairs: [pair('ac-block-c')],
    more: [],
  },
  {
    id: 'outdoor-cleaning',
    title: 'Pavements and stone cleaning',
    place: 'Around the building',
    group: 'Common areas',
    summary: 'The pavements, columns and parking ramp were pressure-washed.',
    pairs: [pair('outdoor-column', 'Column'), pair('outdoor-walk', 'Walkway')],
    more: [photo('outdoor-parking'), photo('outdoor-entrance')],
  },
];
