import { Link } from 'react-router-dom';
import { TEAM_GROUPS, type TeamMember } from '../people';
import { initials } from '../names';
import PeopleHeader from '../PeopleHeader';
import { IconPhone, IconShield, IconSparkle, IconConcierge, IconUser } from '../../components/Icons';
import { clockLabel, isOnDuty, useBeirutNow } from '../shifts';
import { ASSISTANT, CHAIRMAN, MANAGER, byPost, onDutyCount, type PersonLike } from '../staffSchedule';
import { useFitHeight } from '../useFitHeight';
import '../../styles/people.css';

/** a small green dot that says someone is working right now */
const OnDutyDot = () => (
  <span className="ft-on-dot" title="On duty now">
    <span className="sr-only">On duty now</span>
  </span>
);

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/**
 * Our People is a family tree standing in the building's private garden (drawn after the
 * photograph of it, without using the photograph): the limestone wall and its windows, a
 * clipped hedge on a stone kerb and a lawn of small round leaves. One tree rises up the middle:
 * the chairman in its crown, the manager and the assistant on its upper branches, and the teams
 * that run the building on its lower ones, each person with their name and phone.
 *
 * On a desktop the whole tree fits the window without scrolling and spans the full width: the
 * stage takes the height left below the page header, and every position below is a percentage
 * of the stage, so the tree spreads with the screen instead of scaling as one picture.
 */

/** the family tree's branches, in percent of the stage (x across, y down) */
const TRUNK = { x: 50, officersFrom: 27, teamsFrom: 50 };
const OFFICERS = { y: 33, x: [27, 73] };
const TEAMS = { y: 56, x: [33, 73, 90] };

type Leaf = { x: number; y: number; rotation: number; scale: number; color: string };
const OLIVE = ['#6c8466', '#7d927a', '#94a68f', '#a9b8a1', '#5d7659', '#b7c4ad'];

/** leaves scattered on the golden angle, so a crown reads dense and irregular */
function scatter(cx: number, cy: number, rx: number, ry: number, count: number, seed: number): Leaf[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963 + seed;
    const radius = Math.sqrt((index + 0.5) / count);
    return {
      x: cx + Math.cos(angle) * rx * radius,
      y: cy + Math.sin(angle) * ry * radius,
      rotation: (angle * 180) / Math.PI + 90 + ((index % 5) - 2) * 12,
      scale: 0.7 + radius * 0.4,
      color: OLIVE[(index + Math.round(seed * 3)) % OLIVE.length],
    };
  });
}

/** a crown as three overlapping blobs of leaves, drawn in a 600 × 300 box */
function crown(seed: number) {
  return [
    { cx: 190, cy: 175, rx: 175, ry: 110 },
    { cx: 410, cy: 172, rx: 180, ry: 112 },
    { cx: 300, cy: 120, rx: 210, ry: 116 },
  ].map((blob, index) => ({ ...blob, leaves: scatter(blob.cx, blob.cy, blob.rx, blob.ry, Math.round(blob.rx / 2.4), seed + index) }));
}
const MAIN_CROWN = crown(4.1);
const SIDE_CROWN = crown(1.3);

function Crown({ blobs, className }: { blobs: ReturnType<typeof crown>; className: string }) {
  return (
    <svg className={className} viewBox="0 0 600 300" aria-hidden="true">
      {blobs.map((blob, index) => (
        <g key={index}>
          <ellipse cx={blob.cx} cy={blob.cy} rx={blob.rx} ry={blob.ry} fill="#6f8668" opacity="0.92" />
          {blob.leaves.map((leaf, leafIndex) => (
            <path
              key={leafIndex}
              d="M-11 0C-5.5 -7 5.5 -7 11 0C5.5 7 -5.5 7 -11 0Z"
              fill={leaf.color}
              transform={`translate(${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)}) rotate(${leaf.rotation.toFixed(1)}) scale(${leaf.scale.toFixed(2)})`}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** a branch from the trunk at `fromY` out to (x, y), in stage percent */
const branch = (fromY: number, x: number, y: number) =>
  `M${TRUNK.x} ${fromY}C${(TRUNK.x + x) / 2} ${fromY} ${x} ${fromY + (y - fromY) * 0.35} ${x} ${y}`;

/** The shift every member works, when they all work the same one (said once, not on every card). */
function sharedShift(members: TeamMember[]): string | undefined {
  const first = members[0]?.shift;
  return members.length > 1 && first && members.every((member) => member.shift === first) ? first : undefined;
}

const GROUP_ICON: Record<string, typeof IconShield> = {
  Security: IconShield,
  Cleaning: IconSparkle,
  Concierge: IconConcierge,
};

/** A team member on the tree: their name and phone, or an outlined place until they are known. */
function MemberChip({
  member,
  role,
  showShift = true,
  onDuty = false,
}: {
  member: TeamMember;
  role: string;
  showShift?: boolean;
  onDuty?: boolean;
}) {
  const Icon = GROUP_ICON[role] ?? IconUser;
  const known = Boolean(member.name);
  const shift = showShift ? member.shift : undefined;
  return (
    <li className={`ft-member${known ? '' : ' is-open'}${onDuty ? ' is-on' : ''}`} title={member.name}>
      {onDuty && <OnDutyDot />}
      <span className="ft-member-avatar" aria-hidden="true">
        {member.photo ? (
          <img src={member.photo} alt="" width={64} height={64} loading="lazy" />
        ) : known ? (
          initials(member.name!)
        ) : (
          <Icon size={14} />
        )}
      </span>
      <span className="ft-member-text">
        <strong>{member.name ?? 'Name to come'}</strong>
        {member.phone && (
          <a href={tel(member.phone)}>
            <IconPhone size={10} /> {member.phone}
          </a>
        )}
        {shift && <span className="ft-member-shift">{shift}</span>}
        {!member.phone && !member.shift && <span>Details to come</span>}
      </span>
    </li>
  );
}

/** One place in a team group (the phone layout): the person once known, an outlined place until then. */
function TeamPlace({ member, onDuty = false }: { member: TeamMember; onDuty?: boolean }) {
  const known = Boolean(member.name);
  return (
    <li className={`pt-place${known ? '' : ' is-open'}${onDuty ? ' is-on' : ''}`}>
      {onDuty && <OnDutyDot />}
      <span className="pt-place-avatar" aria-hidden="true">
        {member.photo ? (
          <img src={member.photo} alt="" width={80} height={80} loading="lazy" />
        ) : known ? (
          initials(member.name!)
        ) : (
          <IconUser size={16} />
        )}
      </span>
      <span className="pt-place-text">
        <strong>{member.name ?? 'Name to come'}</strong>
        {member.phone && (
          <a href={tel(member.phone)}>
            <IconPhone size={11} /> {member.phone}
          </a>
        )}
        {member.shift && <span>{member.shift}</span>}
        {!member.phone && !member.shift && <span>Details to come</span>}
      </span>
    </li>
  );
}

function PersonCard({ person, lead = false, onDuty = false }: { person: PersonLike; lead?: boolean; onDuty?: boolean }) {
  const Heading = lead ? 'h2' : 'h3';

  return (
    <article className={`pt-card${lead ? ' is-lead' : ''}${onDuty ? ' is-on' : ''}`}>
      {onDuty && <OnDutyDot />}
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
        {person.hours && (
          <p className="pt-hours">
            Office {person.hours}
            {onDuty && <span className="pt-in"> · in now</span>}
          </p>
        )}
      </div>
    </article>
  );
}

export default function People() {
  const chairman = CHAIRMAN;
  const manager = MANAGER;
  const assistant = ASSISTANT;
  const teamCount = TEAM_GROUPS.reduce((sum, group) => sum + group.members.length, 0);

  // who is working now (Beirut time); the day's full schedule is its own page
  const now = useBeirutNow();

  // The stage takes the height left in the window below it, so the tree fits without scrolling.
  const [stageRef, fitHeight] = useFitHeight<HTMLDivElement>();
  const stageHeight = fitHeight ?? 680;

  return (
    <div className="rs-page people-page">
      <PeopleHeader
        title="Garden Tree"
        lede="The people who look after Garden View, and how to reach them. For anything else, the manager’s office is your first point of contact."
      />

      <div className="pt-stage-wrap ft-wrap">
        <div className="ft-stage" ref={stageRef} style={{ height: stageHeight }}>
          <Link to="/portal/people/schedule" className="ft-now-chip">
            <span className="sc-dot" aria-hidden="true" />
            {onDutyCount(now)} on duty now · {clockLabel(now)}
          </Link>
          {/* the garden: wall and windows, hedge on its kerb, the lawn */}
          <div className="ft-wall" aria-hidden="true" />
          <div className="ft-hedge" aria-hidden="true" />
          <div className="ft-lawn" aria-hidden="true" />
          <Crown blobs={SIDE_CROWN} className="ft-side-crown is-left" />
          <Crown blobs={SIDE_CROWN} className="ft-side-crown is-right" />

          {/* the family tree: trunk, crown and branches */}
          <div className="ft-trunk" aria-hidden="true" />
          <Crown blobs={MAIN_CROWN} className="ft-crown" />
          <svg className="ft-branches" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {OFFICERS.x.map((x) => (
              <path key={`o${x}`} d={branch(TRUNK.officersFrom, x, OFFICERS.y)} className="is-upper" vectorEffect="non-scaling-stroke" />
            ))}
            {TEAMS.x.slice(0, TEAM_GROUPS.length).map((x) => (
              <path key={`t${x}`} d={branch(TRUNK.teamsFrom, x, TEAMS.y)} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>

          <div className="ft-node ft-chairman">
            <PersonCard person={chairman} lead />
          </div>
          {manager && (
            <div className="ft-node ft-officer" style={{ left: `${OFFICERS.x[0]}%`, top: `${OFFICERS.y}%` }}>
              <PersonCard person={manager} onDuty={isOnDuty(manager.hours, now)} />
            </div>
          )}
          {assistant && (
            <div className="ft-node ft-officer" style={{ left: `${OFFICERS.x[1]}%`, top: `${OFFICERS.y}%` }}>
              <PersonCard person={assistant} onDuty={isOnDuty(assistant.hours, now)} />
            </div>
          )}

          {TEAM_GROUPS.map((group, index) => {
            const Icon = GROUP_ICON[group.role] ?? IconUser;
            const count = group.members.length;
            return (
              <section
                key={group.role}
                className={`ft-node ft-team is-${group.role.toLowerCase()}`}
                style={{ left: `${TEAMS.x[index] ?? 50}%`, top: `${TEAMS.y}%` }}
                aria-label={`${group.role}, ${count} ${count === 1 ? group.singular : group.plural}`}
              >
                <header className="ft-team-plaque">
                  <span className="ft-team-icon">
                    <Icon size={15} />
                  </span>
                  <strong>{group.role}</strong>
                  <span className="ft-team-count">{count}</span>
                  {byPost(group.members)
                    .filter(({ post, members }) => post && members.length === 1)
                    .map(({ post, members }) => (
                      <span key={post} className="ft-team-extra">
                        {post}: <b>{members[0].name ?? 'to come'}</b>
                      </span>
                    ))}
                </header>
                {byPost(group.members).length > 1 ? (
                  <div className="ft-posts">
                    {byPost(group.members)
                      .filter(({ members }) => members.length > 1)
                      .map(({ post, members }) => (
                      <div key={post} className="ft-post">
                        <p className="ft-post-name">{post}</p>
                        <ul className="ft-members">
                          {members.map((member, memberIndex) => (
                            <MemberChip
                              key={memberIndex}
                              member={member}
                              role={group.role}
                              onDuty={isOnDuty(member.shift, now)}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {sharedShift(group.members) && <p className="ft-post-name">{sharedShift(group.members)}</p>}
                    <ul className="ft-members">
                      {group.members.map((member, memberIndex) => (
                        <MemberChip
                          key={memberIndex}
                          member={member}
                          role={group.role}
                          showShift={!sharedShift(group.members)}
                          onDuty={isOnDuty(member.shift, now)}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <div className="pt-mobile">
        <span className="pt-m-line" aria-hidden="true" />
        <div className="pt-m-item">
          <PersonCard person={chairman} lead />
        </div>
        {manager && (
          <div className="pt-m-item">
            <PersonCard person={manager} onDuty={isOnDuty(manager.hours, now)} />
          </div>
        )}
        {assistant && (
          <div className="pt-m-item">
            <PersonCard person={assistant} onDuty={isOnDuty(assistant.hours, now)} />
          </div>
        )}
        <p className="pt-m-root">Garden View · Beirut Central District</p>
      </div>

      <section className="pt-crew" aria-labelledby="the-team">
        <div className="pt-crew-head">
          <h2 id="the-team">The team on the ground</h2>
          <p>
            {teamCount} people look after the building every day. Their names and numbers are added here as they are
            confirmed.
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
                {byPost(group.members).map(({ post, members }) => (
                  <div key={post} className="pt-post">
                    {post && <p className="pt-post-name">{post}</p>}
                    <ul className="pt-places">
                      {members.map((member, index) => (
                        <TeamPlace
                          key={`${group.role}-${post}-${index}`}
                          member={member}
                          onDuty={isOnDuty(member.shift, now)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
