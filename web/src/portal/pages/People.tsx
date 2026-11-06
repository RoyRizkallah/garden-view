import { IconPhone } from '../../components/Icons';
import { PEOPLE, TEAM } from '../people';

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export default function People() {
  const [chairman, ...officers] = PEOPLE;

  return (
    <div className="portal-page people-page">
      <header className="svc-head">
        <div>
          <p className="svc-kicker">The building</p>
          <h1>Our people.</h1>
          <p>Who looks after Garden View, and how to reach them.</p>
        </div>
      </header>

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

        {TEAM.length === 0 && <p className="dir-later">The rest of the team will be added here.</p>}
      </section>
    </div>
  );
}
