import { useLayoutEffect, useRef, useState } from 'react';
import { PEOPLE, TEAM_GROUPS, type TeamMember } from '../people';
import { initials } from '../names';
import PageHeader from '../PageHeader';
import { IconPhone, IconShield, IconSparkle, IconConcierge, IconUser } from '../../components/Icons';
import '../../styles/people.css';

type PersonLike = { name: string; role: string; phone: string; photo?: string };

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

const DESIGN_WIDTH = 1000;
const DESIGN_HEIGHT = 660;
/** where the stone kerb meets the lawn */
const GROUND_Y = 372;

/**
 * Our People is drawn as the building's private garden (after the photograph of it, without
 * using the photograph): the limestone wall and its windows beyond, a clipped hedge on a stone
 * kerb, three olive-like trees with silvery crowns, a lawn of small round leaves, and the old
 * trunk that frames the view from the left. The people stand in the garden on their cards.
 */
const GARDEN_TREES = [
  { x: 520, top: 168, rx: 190, trunk: 16 },
  { x: 268, top: 222, rx: 128, trunk: 11 },
  { x: 800, top: 214, rx: 140, trunk: 12 },
];

type Leaf = { x: number; y: number; rotation: number; scale: number; color: string };
const OLIVE = ['#6c8466', '#7d927a', '#94a68f', '#a9b8a1', '#5d7659', '#b7c4ad'];

/** leaves scattered on the golden angle, so a crown reads dense and irregular */
function scatter(cx: number, cy: number, rx: number, ry: number, count: number, seed: number, palette: string[]): Leaf[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963 + seed;
    const radius = Math.sqrt((index + 0.5) / count);
    return {
      x: cx + Math.cos(angle) * rx * radius,
      y: cy + Math.sin(angle) * ry * radius,
      rotation: (angle * 180) / Math.PI + 90 + ((index % 5) - 2) * 12,
      scale: 0.7 + radius * 0.4,
      color: palette[(index + Math.round(seed * 3)) % palette.length],
    };
  });
}

const CROWNS = GARDEN_TREES.flatMap((tree, treeIndex) => {
  const ry = tree.rx * 0.56;
  const cy = tree.top + 6;
  return [
    { cx: tree.x - tree.rx * 0.38, cy: cy + ry * 0.2, rx: tree.rx * 0.6, ry: ry * 0.72 },
    { cx: tree.x + tree.rx * 0.36, cy: cy + ry * 0.16, rx: tree.rx * 0.62, ry: ry * 0.74 },
    { cx: tree.x, cy: cy - ry * 0.18, rx: tree.rx * 0.72, ry: ry * 0.8 },
  ].map((blob, blobIndex) => ({
    ...blob,
    leaves: scatter(blob.cx, blob.cy, blob.rx, blob.ry, Math.round(blob.rx / 2.6), treeIndex * 1.7 + blobIndex, OLIVE),
  }));
});

/** the overhanging branch's leaves, darker, in the top-left corner */
const OVERHANG = [
  ...scatter(250, 46, 150, 52, 64, 0.4, ['#3f5a3a', '#4f6b48', '#5e7a55', '#33492f']),
  ...scatter(400, 30, 90, 36, 34, 2.2, ['#3f5a3a', '#4f6b48', '#5e7a55']),
];

/** windows of the wall beyond, [x, y], every 140 units across the visible width */
function windowsFor(extra: number): [number, number][] {
  const first = 150 - Math.ceil(extra / 140) * 140;
  const out: [number, number][] = [];
  for (let x = first; x < DESIGN_WIDTH + extra; x += 140) out.push([x, 36], [x, 150]);
  return out;
}

/** the hedge along the kerb, [x, half-width, tone], across the visible width */
function hedgeFor(extra: number): [number, number, string][] {
  const first = 10 - Math.ceil(extra / 44) * 44;
  const out: [number, number, string][] = [];
  for (let x = first, index = 0; x < DESIGN_WIDTH + extra + 44; x += 44, index += 1) {
    out.push([x, 32 + (Math.abs(index) % 3) * 4, index % 2 ? '#4f6a4c' : '#5b7756']);
  }
  return out;
}

const GROUP_ICON: Record<string, typeof IconShield> = {
  Security: IconShield,
  Cleaning: IconSparkle,
  Concierge: IconConcierge,
};

/**
 * Where each team member stands in the garden, in scene units (1000 × 660): the security
 * guards hang in the three crowns, the cleaners and the concierge stand on the lawn
 * between the manager and the assistant.
 */
const GARDEN_SPOTS: Record<string, [number, number][]> = {
  Security: [
    [205, 198], [300, 190], [252, 284],
    [452, 150], [592, 150], [522, 100],
    [752, 200], [840, 192], [796, 284],
  ],
  Cleaning: [[462, 548], [538, 548]],
  Concierge: [[500, 620]],
};

/** A team member as a medallion in the garden: the role until the person is known. */
function GardenBadge({ member, role }: { member: TeamMember; role: string }) {
  const Icon = GROUP_ICON[role] ?? IconUser;
  const known = Boolean(member.name);
  const first = member.name?.split(' ')[0];
  const body = (
    <>
      <span className="pt-badge-avatar" aria-hidden="true">
        {member.photo ? <img src={member.photo} alt="" width={88} height={88} loading="lazy" /> : known ? initials(member.name!) : <Icon size={18} />}
      </span>
      <span className="pt-badge-label">{known ? first : role}</span>
    </>
  );
  const label = known ? `${member.name}, ${role}` : `${role}: name to come`;
  return member.phone ? (
    <a className="pt-badge is-known" href={tel(member.phone)} title={`${label} · ${member.phone}`} aria-label={`Call ${label}`}>
      {body}
    </a>
  ) : (
    <span className={`pt-badge${known ? ' is-known' : ''}`} title={label} aria-label={label} role="img">
      {body}
    </span>
  );
}

/** One place in a team group: the person once known, an outlined place until then. */
function TeamPlace({ member }: { member: TeamMember }) {
  const known = Boolean(member.name);
  return (
    <li className={`pt-place${known ? '' : ' is-open'}`}>
      <span className="pt-place-avatar" aria-hidden="true">
        {member.photo ? <img src={member.photo} alt="" width={80} height={80} loading="lazy" /> : known ? initials(member.name!) : <IconUser size={16} />}
      </span>
      <span className="pt-place-text">
        <strong>{member.name ?? 'Name to come'}</strong>
        {member.phone ? (
          <a href={tel(member.phone)}>
            <IconPhone size={11} /> {member.phone}
          </a>
        ) : (
          <span>Details to come</span>
        )}
      </span>
    </li>
  );
}

function PersonCard({ person, lead = false }: { person: PersonLike; lead?: boolean }) {
  const Heading = lead ? 'h2' : 'h3';

  return (
    <article className={`pt-card${lead ? ' is-lead' : ''}`}>
      <span className={`pt-avatar${person.photo ? ' has-photo' : ''}`} aria-hidden="true">
        {person.photo ? (
          <picture>
            <source srcSet={person.photo.replace(/\.jpg$/, '.webp')} type="image/webp" />
            <img src={person.photo} alt="" width={200} height={200} loading="lazy" />
          </picture>
        ) : (
          initials(person.name)
        )}
      </span>
      <div className="pt-info">
        <p className="pt-role">{person.role}</p>
        <Heading className="pt-name">{person.name}</Heading>
        <a className="pt-phone" href={tel(person.phone)}>
          <IconPhone size={11} />
          {person.phone}
        </a>
      </div>
    </article>
  );
}

export default function People() {
  const [chairman, ...officers] = PEOPLE;
  const manager = officers.find((person) => person.role === 'Manager') ?? officers[0];
  const assistant = officers.find((person) => person.role === 'Assistant') ?? officers[1];
  const callPerson = manager ?? chairman;

  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, extra: 0 });
  const { scale, extra } = view;
  const span = DESIGN_WIDTH + 2 * extra;

  // The garden is drawn at a fixed 1000 × 660 so the trees, lawn and cards stay in register,
  // and the canvas is scaled as one piece, up to 1.3×. On a wider stage the backdrop (wall,
  // hedge, kerb, lawn) extends by `extra` units on each side so the scene always fills it.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const width = stage.clientWidth;
      const next = Math.min(1.3, Math.max(0.72, width / DESIGN_WIDTH));
      setView({ scale: next, extra: Math.max(0, (width / next - DESIGN_WIDTH) / 2) });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="rs-page people-page">
      <PageHeader
        kicker="The building"
        title="Our people."
        lede="The people who look after Garden View — and how to reach them."
        actions={
          <a className="rs-btn rs-btn-primary" href={tel(callPerson.phone)}>
            <IconPhone size={14} /> Call the manager
          </a>
        }
      />

      <div className="pt-stage-wrap">
        <div className="pt-stage" ref={stageRef} style={{ height: DESIGN_HEIGHT * scale }}>
          <div className="pt-canvas" style={{ transform: `scale(${scale})` }}>
            <svg
              className="pt-tree pt-garden"
              viewBox={`${-extra} 0 ${span} ${DESIGN_HEIGHT}`}
              style={{ left: -extra, width: span }}
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="gw-wall" x1="0" y1="0" x2="0" y2={GROUND_Y} gradientUnits="userSpaceOnUse">
                  <stop stopColor="#f4f0e7" />
                  <stop offset="1" stopColor="#e5ddcc" />
                </linearGradient>
                <radialGradient id="gw-sun" cx="0.82" cy="0.05" r="0.75">
                  <stop stopColor="#f6e6c2" stopOpacity="0.75" />
                  <stop offset="1" stopColor="#f6e6c2" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="gw-lawn" x1="0" y1={GROUND_Y} x2="0" y2={DESIGN_HEIGHT} gradientUnits="userSpaceOnUse">
                  <stop stopColor="#7d9868" />
                  <stop offset="0.45" stopColor="#617f50" />
                  <stop offset="1" stopColor="#4a6a40" />
                </linearGradient>
                {/* the ground-cover: small round leaves, as in the garden */}
                <pattern id="gw-clover" width="16" height="12" patternUnits="userSpaceOnUse">
                  <ellipse cx="4" cy="4" rx="3.2" ry="2.4" fill="#9db685" opacity="0.5" />
                  <ellipse cx="12" cy="9" rx="3" ry="2.2" fill="#3f5c37" opacity="0.38" />
                  <ellipse cx="11" cy="2.5" rx="1.8" ry="1.3" fill="#c2d2a8" opacity="0.32" />
                </pattern>
                <linearGradient id="gw-bark" x1="0" y1="0" x2="1" y2="0">
                  <stop stopColor="#5d5143" />
                  <stop offset="0.55" stopColor="#857561" />
                  <stop offset="1" stopColor="#64574a" />
                </linearGradient>
              </defs>

              {/* the building's limestone wall, with its windows, beyond the garden */}
              <rect x={-extra} width={span} height={GROUND_Y} fill="url(#gw-wall)" />
              <g className="pt-g-windows" fill="#d8cfbd" opacity="0.6">
                {windowsFor(extra).map(([x, y], index) => (
                  <g key={index}>
                    <rect x={x} y={y} width="62" height="74" rx="2" />
                    <path d={`M${x + 31} ${y}V${y + 74}`} stroke="#efe9dc" strokeWidth="2" />
                  </g>
                ))}
              </g>
              <rect x={-extra} width={span} height={GROUND_Y} fill="url(#gw-sun)" />

              {/* clipped hedge on a stone kerb */}
              <g className="pt-g-hedge">
                {hedgeFor(extra).map(([x, rx, tone], index) => (
                  <ellipse key={index} cx={x} cy={GROUND_Y - 22} rx={rx} ry="24" fill={tone} />
                ))}
              </g>
              <rect x={-extra} y={GROUND_Y - 8} width={span} height="14" fill="#d9cdb6" />
              <rect x={-extra} y={GROUND_Y - 8} width={span} height="3" fill="#efe7d6" />

              {/* the lawn */}
              <rect x={-extra} y={GROUND_Y + 6} width={span} height={DESIGN_HEIGHT - GROUND_Y} fill="url(#gw-lawn)" />
              <rect x={-extra} y={GROUND_Y + 6} width={span} height={DESIGN_HEIGHT - GROUND_Y} fill="url(#gw-clover)" />

              {/* the garden's trees: shadows, trunks, then silvery crowns */}
              {GARDEN_TREES.map((tree, index) => (
                <ellipse
                  key={`shadow-${index}`}
                  cx={tree.x + 24}
                  cy={GROUND_Y + 22}
                  rx={tree.rx * 0.7}
                  ry="16"
                  fill="#2f4a2c"
                  opacity="0.28"
                />
              ))}
              {GARDEN_TREES.map((tree, index) => (
                <path
                  key={`trunk-${index}`}
                  d={`M${tree.x - tree.trunk} ${GROUND_Y + 14}C${tree.x - tree.trunk * 0.6} ${tree.top + 90} ${tree.x - 8} ${tree.top + 60} ${tree.x - 4} ${tree.top + 20}H${tree.x + 4}C${tree.x + 10} ${tree.top + 60} ${tree.x + tree.trunk * 0.6} ${tree.top + 90} ${tree.x + tree.trunk} ${GROUND_Y + 14}Z`}
                  fill="url(#gw-bark)"
                />
              ))}
              {CROWNS.map((crown, index) => (
                <g key={`crown-${index}`}>
                  <ellipse cx={crown.cx} cy={crown.cy} rx={crown.rx} ry={crown.ry} fill="#6f8668" opacity="0.92" />
                  {crown.leaves.map((leaf, leafIndex) => (
                    <path
                      key={leafIndex}
                      d="M-9 0C-4.5 -6 4.5 -6 9 0C4.5 6 -4.5 6 -9 0Z"
                      fill={leaf.color}
                      transform={`translate(${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)}) rotate(${leaf.rotation.toFixed(1)}) scale(${leaf.scale.toFixed(2)})`}
                    />
                  ))}
                </g>
              ))}

              {/* the old trunk that frames the view from the left, its branch reaching across the top */}
              <g transform={`translate(${-extra} 0)`}>
              <g transform="scale(0.6 1)">
                <path
                  d="M0 660V0H58C70 40 64 90 80 140C92 178 118 196 132 236C146 276 128 330 136 380C144 432 166 470 160 520C154 572 128 610 132 660Z"
                  fill="#4d4235"
                />
                <path d="M24 660C30 560 22 470 40 380C54 312 40 240 54 170" stroke="#6d5f4d" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
                <path d="M92 660C98 600 86 540 100 470C112 410 96 350 108 290" stroke="#3a3128" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
              </g>
              <path d="M44 120C120 70 220 46 340 30C380 24 420 22 460 24" stroke="#4d4235" strokeWidth="26" strokeLinecap="round" />
              <path d="M200 60C230 30 270 12 310 0" stroke="#4d4235" strokeWidth="12" strokeLinecap="round" />
              <g className="pt-g-overhang">
                {OVERHANG.map((leaf, index) => (
                  <path
                    key={index}
                    d="M-9 0C-4.5 -6 4.5 -6 9 0C4.5 6 -4.5 6 -9 0Z"
                    fill={leaf.color}
                    transform={`translate(${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)}) rotate(${leaf.rotation.toFixed(1)}) scale(${leaf.scale.toFixed(2)})`}
                  />
                ))}
              </g>
              </g>
            </svg>

            <div className="pt-node pt-node-chairman" style={{ left: '52%', top: '50%' }}>
              <PersonCard person={chairman} lead />
            </div>

            {manager && (
              <div className="pt-node pt-node-manager" style={{ left: '28%', top: '79%' }}>
                <PersonCard person={manager} />
              </div>
            )}

            {TEAM_GROUPS.flatMap((group) =>
              group.members.slice(0, GARDEN_SPOTS[group.role]?.length ?? 0).map((member, index) => {
                const [x, y] = GARDEN_SPOTS[group.role][index];
                return (
                  <div
                    key={`${group.role}-${index}`}
                    className={`pt-badge-node is-${group.role.toLowerCase()}`}
                    style={{ left: `${(x / DESIGN_WIDTH) * 100}%`, top: `${(y / DESIGN_HEIGHT) * 100}%` }}
                  >
                    <GardenBadge member={member} role={group.role} />
                  </div>
                );
              }),
            )}

            {assistant && (
              <div className="pt-node pt-node-assistant" style={{ left: '76%', top: '79%' }}>
                <PersonCard person={assistant} />
              </div>
            )}
          </div>
        </div>

        <p className="pt-ground">Garden View · Beirut Central District</p>
      </div>

      <div className="pt-mobile">
        <span className="pt-m-line" aria-hidden="true" />
        <div className="pt-m-item">
          <PersonCard person={chairman} lead />
        </div>
        {manager && (
          <div className="pt-m-item">
            <PersonCard person={manager} />
          </div>
        )}
        {assistant && (
          <div className="pt-m-item">
            <PersonCard person={assistant} />
          </div>
        )}
        <p className="pt-m-root">Garden View · Beirut Central District</p>
      </div>

      <section className="pt-crew" aria-labelledby="the-team">
        <div className="pt-crew-head">
          <h2 id="the-team">The team on the ground</h2>
          <p>
            {TEAM_GROUPS.reduce((sum, group) => sum + group.members.length, 0)} people look after the building every
            day. Their names and numbers are added here as they are confirmed.
          </p>
        </div>
        <div className="pt-crew-groups">
          {TEAM_GROUPS.map((group) => {
            const Icon = GROUP_ICON[group.role] ?? IconUser;
            const count = group.members.length;
            return (
              <article key={group.role} className={`pt-crew-group is-${group.role.toLowerCase()}`}>
                <header>
                  <span className="pt-crew-icon">
                    <Icon size={18} />
                  </span>
                  <h3>{group.role}</h3>
                  <span className="pt-crew-count">
                    {count} {count === 1 ? group.singular : group.plural}
                  </span>
                </header>
                <ul className="pt-places">
                  {group.members.map((member, index) => (
                    <TeamPlace key={`${group.role}-${index}`} member={member} />
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <p className="pt-note">
        For anything else, the manager&rsquo;s office is your first point of contact.
      </p>
    </div>
  );
}
