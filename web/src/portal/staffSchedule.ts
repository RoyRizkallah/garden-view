import { PEOPLE, TEAM_GROUPS, type TeamMember } from './people';
import { boardStart, isOnDuty, layoutRow, type BoardSection } from './shifts';

/** a person on the tree with a phone, and office hours for the officers */
export type PersonLike = { name: string; role: string; phone: string; photo?: string; hours?: string };

const [chairman, ...officers] = PEOPLE as readonly PersonLike[];
export const CHAIRMAN = chairman;
export const MANAGER = officers.find((person) => person.role.includes('Manager')) ?? officers[0];
export const ASSISTANT = officers.find((person) => person !== MANAGER) ?? officers[1];

/** a team's members grouped by post, in the order the posts first appear ('' when a team has no posts) */
export function byPost(members: TeamMember[]): { post: string; members: TeamMember[] }[] {
  const posts: { post: string; members: TeamMember[] }[] = [];
  for (const member of members) {
    const post = member.post ?? '';
    const entry = posts.find((item) => item.post === post);
    if (entry) entry.members.push(member);
    else posts.push({ post, members: [member] });
  }
  return posts;
}

const officeHours = officers.filter((person) => person.hours);
const staff = TEAM_GROUPS.flatMap((group) => group.members);

/** the schedule board's first hour: the day's earliest start */
export const BOARD_START = boardStart([...officeHours.map((person) => person.hours), ...staff.map((member) => member.shift)]);

/** the day's shifts, office first, then each team by post (the same entries the tree shows) */
export const BOARD_SECTIONS: BoardSection[] = [
  {
    title: 'Office',
    rows: [layoutRow('', officeHours.map((person) => ({ name: person.name, hours: person.hours })), BOARD_START)],
  },
  ...TEAM_GROUPS.map((group) => ({
    title: group.role,
    rows: byPost(group.members).map(({ post, members }) =>
      layoutRow(post, members.map((member) => ({ name: member.name ?? 'To come', hours: member.shift })), BOARD_START),
    ),
  })),
];

/** how many people are working at `now` (minutes since midnight, Beirut) */
export const onDutyCount = (now: number) =>
  officeHours.filter((person) => isOnDuty(person.hours, now)).length +
  staff.filter((member) => isOnDuty(member.shift, now)).length;
