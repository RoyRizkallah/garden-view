import media from './photoshoot-media.json';

// The client's professional shoot, one chapter per block plus the fitness floor and the shared
// spaces. Pixels come from scripts/build_media.py (photoshoot-media.json); this file only holds
// order and words. Captions describe what is in frame and nothing more.
//
// Each chapter's first two photos sit beside its film, so they should show something the film's
// preview doesn't; the rest fill rows of three (or two), so
// photo counts are chosen to leave no orphan tile: 7→2+3+2, 4→2+2, 5→2+3, 8→2+3+3.

export type ShootPhoto = { src: string; title: string; tag: string };
export type ShootFilm = {
  duration: number;
  poster: string;
  loop: string;
  sources: { src: string; media?: string }[];
};
export type ShootChapter = {
  id: string;
  title: string;
  kicker: string;
  summary: string;
  facts: string[];
  film?: ShootFilm;
  photos: ShootPhoto[];
};

const photo = (name: string, title: string, tag: string): ShootPhoto => ({
  src: `/images/shoot/${name}.jpg`,
  title,
  tag,
});
const film = (slug: string): ShootFilm | undefined =>
  (media.films as Record<string, ShootFilm | undefined>)[slug];

export const SHOOT_CHAPTERS: ShootChapter[] = [
  {
    id: 'block-a',
    title: 'Block A',
    kicker: 'Residences',
    summary:
      'Planted balconies climb the limestone façade. Inside, an art-lined lobby leads to the lifts and looks out onto the ground-floor garden.',
    facts: ['18 residences', 'Levels G–10'],
    film: film('block-a'),
    photos: [
      photo('block-a-3', 'Entrance lobby', 'Lobby'),
      photo('block-a-4', 'Lobby artwork', 'Lobby'),
      photo('block-a-1', 'Street façade', 'Exterior'),
      photo('block-a-2', 'Planted balconies', 'Exterior'),
      photo('block-a-6', 'Balconies from below', 'Exterior'),
      photo('block-a-7', 'Window onto the garden', 'Ground floor'),
      photo('block-a-5', 'Fire detection at the lifts', 'Safety'),
    ],
  },
  {
    id: 'block-b',
    title: 'Block B',
    kicker: 'Residences',
    summary:
      'The most private of the three blocks, with one residence per floor, stepped terraces and a bright lobby hung with large-format artwork.',
    facts: ['6 residences', 'Full-floor plans'],
    film: film('block-b'),
    photos: [
      photo('block-b-3', 'Artwork and lifts', 'Lobby'),
      photo('block-b-2', 'Stepped terraces', 'Exterior'),
      photo('block-b-4', 'Block B on the street', 'Exterior'),
      photo('block-b-1', 'Façade through the trees', 'Exterior'),
    ],
  },
  {
    id: 'block-c',
    title: 'Block C',
    kicker: 'Residences',
    summary:
      'A covered entrance court, a lobby that looks through to the garden, and quiet wood-panelled landings on every floor.',
    facts: ['17 residences', 'Levels G–10'],
    film: film('block-c'),
    photos: [
      photo('block-c-2', 'Covered entrance', 'Entrance'),
      photo('block-c-3', 'Looking through to the garden', 'Lobby'),
      photo('block-c-1', 'Façade', 'Exterior'),
      photo('block-c-4', 'Residence landing', 'Landing'),
      photo('block-c-5', 'Façade in the trees', 'Exterior'),
    ],
  },
  {
    id: 'fitness',
    title: 'Fitness & Pool',
    kicker: 'Wellness',
    summary:
      'A residents’ fitness studio laid out along an indoor pool, lit from above by a long skylight.',
    facts: ['Indoor pool', 'Cardio & free weights'],
    film: film('gym'),
    photos: [
      photo('gym-2', 'Studio beside the pool', 'Fitness'),
      photo('gym-4', 'Cardio', 'Fitness'),
      photo('gym-3', 'Indoor pool under the skylight', 'Pool'),
      photo('gym-1', 'Strength corner', 'Fitness'),
    ],
  },
  {
    id: 'common',
    title: 'Shared Spaces & Safety',
    kicker: 'Building',
    summary:
      'A private garden, underground parking, a CCTV security room, and the plant that keeps the building running: fire detection, standby generators and central heating.',
    facts: ['Security room', 'Standby power'],
    film: film('common'),
    photos: [
      photo('common-2', 'Security control room', 'Security'),
      photo('common-1', 'Glass-fronted ground floor', 'Entrance'),
      photo('common-3', 'Private garden', 'Garden'),
      photo('common-5', 'Underground parking', 'Parking'),
      photo('common-4', 'Car park barriers', 'Parking'),
      photo('common-6', 'Fire alarm control panel', 'Safety'),
      photo('common-7', 'Standby generators', 'Plant'),
      photo('common-8', 'Boiler room', 'Plant'),
    ],
  },
];

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
