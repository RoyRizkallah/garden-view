import { useEffect, useState } from 'react';
import { IconCalendar, IconMapPin } from '../../components/Icons';
import { api, type ResidentMeeting } from '../api';

const STATUS_LABEL = { SCHEDULED: 'Upcoming', HELD: 'Notes published', CANCELLED: 'Cancelled' } as const;

function when(iso: string) {
  const date = new Date(iso);
  return {
    month: date.toLocaleDateString(undefined, { month: 'short' }),
    day: date.toLocaleDateString(undefined, { day: 'numeric' }),
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    full: date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

export default function Meetings() {
  const [meetings, setMeetings] = useState<ResidentMeeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ meetings: ResidentMeeting[] }>('/resident/meetings')
      .then((res) => setMeetings(res.meetings))
      .catch((err) => setError(err.message));
  }, []);

  const upcoming = (meetings ?? []).filter((meeting) => meeting.status === 'SCHEDULED');
  const past = (meetings ?? []).filter((meeting) => meeting.status !== 'SCHEDULED');

  return (
    <div className="portal-page mtg-page">
      <header className="svc-head">
        <div>
          <p className="svc-kicker">Owners, together.</p>
          <h1>Meetings and agendas.</h1>
          <p>What will be discussed, and the notes once the meeting has been held.</p>
        </div>
      </header>

      {error && <div className="note-card">{error}</div>}

      {meetings && meetings.length === 0 && (
        <div className="mtg-empty">
          <IconCalendar size={22} />
          <div>
            <strong>No meeting is on the calendar yet.</strong>
            <p>When building management publishes one, the agenda will be here before you arrive.</p>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mtg-section">
          <h2>Coming up</h2>
          <div className="mtg-list">
            {upcoming.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mtg-section">
          <h2>Earlier</h2>
          <div className="mtg-list">
            {past.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: ResidentMeeting }) {
  const date = when(meeting.startsAt);
  return (
    <article className={`mtg-card is-${meeting.status.toLowerCase()}`}>
      <time dateTime={meeting.startsAt}>
        <span>{date.month}</span>
        <strong>{date.day}</strong>
        <em>{date.time}</em>
      </time>
      <div>
        <p className="mtg-status">{STATUS_LABEL[meeting.status]}</p>
        <h3>{meeting.title}</h3>
        <p className="mtg-when">
          {date.full}
          {meeting.location && (
            <>
              <IconMapPin size={13} /> {meeting.location}
            </>
          )}
        </p>
        {meeting.summary && <p className="mtg-summary">{meeting.summary}</p>}
        {meeting.agenda.length > 0 && (
          <ol className="mtg-agenda">
            {meeting.agenda.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                {item.detail && <span>{item.detail}</span>}
              </li>
            ))}
          </ol>
        )}
        {meeting.status === 'HELD' && meeting.notes && (
          <div className="mtg-notes">
            <p>Notes</p>
            {meeting.notes}
          </div>
        )}
      </div>
    </article>
  );
}
