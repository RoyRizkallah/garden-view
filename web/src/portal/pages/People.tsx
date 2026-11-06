import { useLayoutEffect, useRef, useState } from 'react';
import { PEOPLE, TEAM } from '../people';
import { initials } from '../names';
import PageHeader from '../PageHeader';
import { IconPhone } from '../../components/Icons';
import '../../styles/people.css';

type PersonLike = { name: string; role: string; phone: string; photo?: string };
type LeafCluster = { cx: number; cy: number; rx: number; ry: number; count: number };

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

const DESIGN_WIDTH = 1000;
const DESIGN_HEIGHT = 660;

/**
 * The crown is built from overlapping clusters rather than one dome: each is
 * scattered on the golden angle, so the silhouette is irregular and dense.
 */
const CLUSTERS: LeafCluster[] = [
  { cx: 505, cy: 138, rx: 128, ry: 78, count: 33 },
  { cx: 390, cy: 196, rx: 112, ry: 76, count: 29 },
  { cx: 612, cy: 202, rx: 116, ry: 78, count: 29 },
  { cx: 326, cy: 288, rx: 96, ry: 66, count: 25 },
  { cx: 674, cy: 292, rx: 98, ry: 68, count: 25 },
  { cx: 500, cy: 268, rx: 132, ry: 78, count: 33 },
  { cx: 432, cy: 330, rx: 82, ry: 54, count: 19 },
  { cx: 568, cy: 334, rx: 82, ry: 54, count: 19 },
];

const LEAF_COLORS = ['#5f7d68', '#6f8a76', '#7f9a82', '#93a793', '#a9bca4'];

const FOLIAGE = CLUSTERS.map((cluster, clusterIndex) => ({
  ...cluster,
  leaves: Array.from({ length: cluster.count }, (_, index) => {
    const angle = index * 2.399963 + clusterIndex * 0.8;
    const radius = Math.sqrt((index + 0.5) / cluster.count);
    const x = cluster.cx + Math.cos(angle) * cluster.rx * radius;
    const y = cluster.cy + Math.sin(angle) * cluster.ry * radius;
    const rotation = (angle * 180) / Math.PI + 90 + ((index % 5) - 2) * 10;
    const scale = 0.64 + radius * 0.34 + ((index % 3) - 1) * 0.04;
    const gold = (index + clusterIndex * 3) % 23 === 0;
    return {
      x,
      y,
      rotation,
      scale,
      color: gold ? '#c9b07a' : LEAF_COLORS[(index + clusterIndex) % LEAF_COLORS.length],
    };
  }),
}));

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
  const [scale, setScale] = useState(1);

  // The illustration is drawn at a fixed 1000 × 660 so branches, foliage and
  // plaques stay in register; the whole canvas is then scaled as one piece.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const width = stage.clientWidth;
      setScale(Math.min(1.08, Math.max(0.72, width / DESIGN_WIDTH)));
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
            <svg className="pt-tree" viewBox={`0 0 ${DESIGN_WIDTH} ${DESIGN_HEIGHT}`} fill="none" aria-hidden="true">
              <defs>
                <linearGradient
                  id="pt-trunk-fill"
                  x1="500"
                  y1="342"
                  x2="500"
                  y2="600"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#b08a48" stopOpacity="0.2" />
                  <stop offset="1" stopColor="#8fa38e" stopOpacity="0.09" />
                </linearGradient>
                <radialGradient id="pt-halo" cx="0.5" cy="0.5" r="0.5">
                  <stop stopColor="#c9a769" stopOpacity="0.16" />
                  <stop offset="1" stopColor="#c9a769" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="pt-cluster" cx="0.5" cy="0.5" r="0.5">
                  <stop stopColor="#b9cdb2" stopOpacity="0.55" />
                  <stop offset="1" stopColor="#b9cdb2" stopOpacity="0" />
                </radialGradient>
              </defs>

              <ellipse cx="500" cy="230" rx="340" ry="220" fill="url(#pt-halo)" />
              <ellipse cx="500" cy="642" rx="188" ry="13" fill="#1e3a2c" opacity="0.07" />

              <g className="pt-roots" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55">
                <path d="M488 598C458 614 422 626 382 634" />
                <path d="M512 598C542 614 578 626 618 634" />
                <path d="M500 600V640" />
                <path d="M480 600C464 620 442 632 416 642" />
                <path d="M520 600C536 620 558 632 584 642" />
              </g>

              <path
                className="pt-trunk"
                d="M476 600C480 540 478 482 482 440C486 400 492 370 497 340H503C508 370 514 400 518 440C522 482 520 540 524 600Z"
              />

              <g className="pt-bark" stroke="currentColor" strokeLinecap="round" opacity="0.22">
                <path d="M500 578C496 520 503 456 499 402" />
                <path d="M489 532C486 488 490 444 488 408" />
                <path d="M511 490C514 454 510 418 512 386" />
              </g>

              <g className="pt-limbs" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path className="pt-line" pathLength={1} d="M498 348C470 322 445 300 420 280" style={{ animationDelay: '0.18s' }} />
                <path className="pt-line" pathLength={1} d="M502 348C530 322 555 300 580 280" style={{ animationDelay: '0.18s' }} />
                <path className="pt-line" pathLength={1} d="M500 336C490 300 485 270 482 240" style={{ animationDelay: '0.26s' }} />
                <path className="pt-line" pathLength={1} d="M500 336C510 300 515 270 518 240" style={{ animationDelay: '0.26s' }} />
                <path className="pt-line" pathLength={1} d="M420 280C390 262 365 245 342 228" style={{ animationDelay: '0.34s' }} />
                <path className="pt-line" pathLength={1} d="M580 280C610 262 635 245 658 228" style={{ animationDelay: '0.34s' }} />
                <path className="pt-line" pathLength={1} d="M482 240C470 215 455 195 440 175" style={{ animationDelay: '0.42s' }} />
                <path className="pt-line" pathLength={1} d="M518 240C530 215 545 195 560 175" style={{ animationDelay: '0.42s' }} />
                <path className="pt-line" pathLength={1} d="M500 330C500 295 500 260 500 220" style={{ animationDelay: '0.22s' }} />
                <path className="pt-line" pathLength={1} d="M342 228C322 215 305 205 288 198" style={{ animationDelay: '0.48s' }} />
                <path className="pt-line" pathLength={1} d="M658 228C678 215 695 205 712 198" style={{ animationDelay: '0.48s' }} />
                <path className="pt-line" pathLength={1} d="M468 330C450 326 432 321 414 316" style={{ animationDelay: '0.5s' }} />
                <path className="pt-line" pathLength={1} d="M532 330C550 326 568 321 586 316" style={{ animationDelay: '0.5s' }} />

                <path
                  className="pt-line pt-limb-low"
                  pathLength={1}
                  d="M496 442C452 430 402 412 352 400C340 397 334 395 330 392"
                  style={{ animationDelay: '0.12s' }}
                />
                <path
                  className="pt-line pt-limb-low"
                  pathLength={1}
                  d="M504 446C548 434 598 414 648 402C660 399 666 397 670 394"
                  style={{ animationDelay: '0.12s' }}
                />
                <path
                  className="pt-line"
                  pathLength={1}
                  d="M330 394C330 420 330 444 330 468"
                  style={{ animationDelay: '0.45s' }}
                />
                <path
                  className="pt-line"
                  pathLength={1}
                  d="M670 396C670 422 670 446 670 468"
                  style={{ animationDelay: '0.45s' }}
                />
              </g>

              <g className="pt-foliage-blobs" fill="url(#pt-cluster)">
                {CLUSTERS.map((cluster, index) => (
                  <ellipse
                    key={index}
                    cx={cluster.cx}
                    cy={cluster.cy}
                    rx={cluster.rx * 1.08}
                    ry={cluster.ry * 1.14}
                    style={{ animationDelay: `${0.2 + index * 0.05}s` }}
                  />
                ))}
              </g>

              <g className="pt-leaf-cluster" style={{ animationDelay: '0.35s' }}>
                {FOLIAGE[0].leaves.map((leaf, index) => (
                  <g
                    key={index}
                    transform={`translate(${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)}) rotate(${leaf.rotation.toFixed(1)}) scale(${leaf.scale.toFixed(2)})`}
                  >
                    <path d="M-10 0C-5 -7 5 -7 10 0C5 7 -5 7 -10 0Z" fill={leaf.color} opacity="0.88" />
                    <path d="M-8 0H8" stroke="#fffdf8" strokeWidth="0.6" opacity="0.4" />
                  </g>
                ))}
              </g>

              {FOLIAGE.slice(1).map((cluster, clusterIndex) => (
                <g
                  key={clusterIndex}
                  className="pt-leaf-cluster"
                  style={{ animationDelay: `${0.42 + clusterIndex * 0.06}s` }}
                >
                  {cluster.leaves.map((leaf, index) => (
                    <g
                      key={index}
                      transform={`translate(${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)}) rotate(${leaf.rotation.toFixed(1)}) scale(${leaf.scale.toFixed(2)})`}
                    >
                      <path d="M-10 0C-5 -7 5 -7 10 0C5 7 -5 7 -10 0Z" fill={leaf.color} opacity="0.88" />
                      <path d="M-8 0H8" stroke="#fffdf8" strokeWidth="0.6" opacity="0.4" />
                    </g>
                  ))}
                </g>
              ))}

              <g className="pt-hangers" stroke="#b08a48" strokeWidth="1.1" fill="#fffdf8">
                <circle cx="330" cy="392" r="3.4" />
                <circle cx="670" cy="394" r="3.4" />
              </g>

              <g className="pt-ground-leaves" fill="#93a793" opacity="0.55">
                <path d="M430 636C435 629 445 629 450 636C445 643 435 643 430 636Z" transform="rotate(-18 440 636)" />
                <path d="M470 644C475 637 485 637 490 644C485 651 475 651 470 644Z" transform="rotate(14 480 644)" />
                <path d="M540 642C545 635 555 635 560 642C555 649 545 649 540 642Z" transform="rotate(-10 550 642)" />
                <path d="M580 632C585 625 595 625 600 632C595 639 585 639 580 632Z" transform="rotate(24 590 632)" />
              </g>

              <g className="pt-seeds" fill="#b08a48" opacity="0.6">
                <circle cx="288" cy="198" r="2.6" />
                <circle cx="712" cy="198" r="2.6" />
                <circle cx="330" cy="468" r="2.4" />
                <circle cx="670" cy="468" r="2.4" />
                <circle cx="414" cy="316" r="2.2" />
                <circle cx="586" cy="316" r="2.2" />
              </g>
            </svg>

            <div className="pt-node pt-node-chairman" style={{ left: '50%', top: '18.2%' }}>
              <PersonCard person={chairman} lead />
            </div>

            {manager && (
              <div className="pt-node pt-node-manager" style={{ left: '33%', top: '78.8%' }}>
                <PersonCard person={manager} />
              </div>
            )}

            {assistant && (
              <div className="pt-node pt-node-assistant" style={{ left: '67%', top: '78.8%' }}>
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

      {TEAM.length > 0 && (
        <section className="pt-team" aria-labelledby="wider-team">
          <h2 id="wider-team">The wider team</h2>
          <div className="pt-team-grid">
            {TEAM.map((person) => (
              <PersonCard key={person.name} person={person} />
            ))}
          </div>
        </section>
      )}

      <p className="pt-note">
        For anything else, the manager&rsquo;s office is your first point of contact.
      </p>
    </div>
  );
}
