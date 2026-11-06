import { IconPhone } from '../../components/Icons';
import { PEOPLE, TEAM } from '../people';
import PageHeader from '../PageHeader';

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export default function People() {
  const [chairman, ...officers] = PEOPLE;

  return (
    <div className="rs-page people-page">
      <PageHeader
        kicker="The building"
        title="Our people."
        lede="Who looks after Garden View, and how to reach them."
      />

      <section className="dir">
        <article className="dir-lead">
          <div>
            <p>{chairman.role}</p>
            <h2>{chairman.name}</h2>
          </div>
          <a className="dir-call" href={tel(chairman.phone)}>
            <IconPhone size={15} />
            {chairman.phone}
          </a>
        </article>

        <ul>
          {officers.map((person) => (
            <li key={person.name}>
              <div>
                <p>{person.role}</p>
                <strong>{person.name}</strong>
              </div>
              <a className="dir-call" href={tel(person.phone)}>
                <IconPhone size={15} />
                {person.phone}
              </a>
            </li>
          ))}
          {TEAM.map((person) => (
            <li key={person.name}>
              <div>
                <p>{person.role}</p>
                <strong>{person.name}</strong>
              </div>
              <a className="dir-call" href={tel(person.phone)}>
                <IconPhone size={15} />
                {person.phone}
              </a>
            </li>
          ))}
        </ul>

        {TEAM.length === 0 && (
          <p className="dir-later">For anything else, the manager&rsquo;s office is your first point of contact.</p>
        )}
      </section>
    </div>
  );
}
