import { NavLink } from 'react-router-dom';
import PageHeader from './PageHeader';
import { MANAGER, CHAIRMAN } from './staffSchedule';
import { IconPhone } from '../components/Icons';

/** Our People's two pages, the tree and the schedule */
const PEOPLE_PAGES = [
  { to: '/portal/people', label: 'Garden Tree' },
  { to: '/portal/people/schedule', label: 'Schedule' },
];

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** The header both Our People pages share: their title, a switch between them, and the manager's number. */
export default function PeopleHeader({ title, lede }: { title: string; lede: string }) {
  const callPerson = MANAGER ?? CHAIRMAN;
  return (
    <PageHeader
      kicker="Our People"
      title={title}
      lede={lede}
      actions={
        <>
          <nav className="ft-view-switch" aria-label="Our People">
            {PEOPLE_PAGES.map((page) => (
              <NavLink key={page.to} to={page.to} end>
                {page.label}
              </NavLink>
            ))}
          </nav>
          <a className="rs-btn rs-btn-primary" href={tel(callPerson.phone)}>
            <IconPhone size={14} /> Call the manager
          </a>
        </>
      }
    />
  );
}
