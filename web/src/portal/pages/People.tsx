import { IconPhone } from '../../components/Icons';
import { PEOPLE, TEAM } from '../people';

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export default function People() {
  const [chairman, ...officers] = PEOPLE;

  return (
    <div className="portal-page people-page">
      <header className="svc-head">
        <div>
          <p className="svc-kicker">The people who look after the building</p>
          <h1>Our people.</h1>
          <p>Who to call, from the chairman down to the team on the floor.</p>
        </div>
      </header>

      <article className="people-lead">
        <p>{chairman.role}</p>
        <h2>{chairman.name}</h2>
        <a href={tel(chairman.phone)}>
          <IconPhone size={16} />
          {chairman.phone}
        </a>
      </article>

      <div className="people-row">
        {officers.map((person) => (
          <article key={person.name} className="people-card">
            <p>{person.role}</p>
            <h2>{person.name}</h2>
            <a href={tel(person.phone)}>
              <IconPhone size={15} />
              {person.phone}
            </a>
          </article>
        ))}
      </div>

      <section className="people-team">
        <h2>The team</h2>
        {TEAM.length === 0 ? (
          <p>The rest of the Garden View team will be listed here.</p>
        ) : (
          <ul>
            {TEAM.map((person) => (
              <li key={person.name}>
                <div>
                  <strong>{person.name}</strong>
                  <span>{person.role}</span>
                </div>
                <a href={tel(person.phone)}>{person.phone}</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
