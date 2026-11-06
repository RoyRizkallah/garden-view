import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { IconArrowRight, IconCalendar, IconCheck, IconClose, IconMapPin } from '../../components/Icons';
import { api, type ResidentMeeting } from '../api';
import { useAuth } from '../AuthContext';
import { ANTHONY_WHATSAPP } from '../people';

const SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00'];
const BEIRUT = 'Asia/Beirut';

function beirutParts(iso: string) {
  const date = new Date(iso);
  const month = date.toLocaleDateString('en-GB', { month: 'short', timeZone: BEIRUT }).toUpperCase();
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', timeZone: BEIRUT });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: BEIRUT });
  const full = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: BEIRUT });
  return { month, day, time, full };
}

function upcomingWeekdays(count = 12) {
  const days: { value: string; label: string }[] = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  while (days.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    const weekday = cursor.getDay();
    if (weekday === 0 || weekday === 6) continue;
    const value = cursor.toISOString().slice(0, 10);
    const label = cursor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    days.push({ value, label });
  }
  return days;
}

function slotEnd(slot: string) {
  const [hour, minute] = slot.split(':').map(Number);
  const end = new Date(2000, 0, 1, hour, minute + 30);
  return end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

export default function Meetings() {
  const [meetings, setMeetings] = useState<ResidentMeeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ meetings: ResidentMeeting[] }>('/resident/meetings')
      .then((res) => setMeetings(res.meetings))
      .catch((err) => setError(err.message));
  }, []);

  const upcoming = (meetings ?? []).filter((meeting) => meeting.status === 'SCHEDULED');
  const past = (meetings ?? []).filter((meeting) => meeting.status === 'HELD');

  return (
    <div className="portal-page talk-page">
      <header className="svc-head">
        <div>
          <p className="svc-kicker">Good conversations start with clarity</p>
          <h1>Time to talk.</h1>
          <p>Book a management meeting and see what is on the building agenda.</p>
        </div>
        <button type="button" className="talk-book" onClick={() => setOpen(true)}>
          + Book a meeting
        </button>
      </header>

      {error && <div className="note-card">{error}</div>}

      <div className="talk-grid">
        <section className="talk-agenda">
          <header>
            <h2>Transparent agenda</h2>
            <span>Beirut time · GMT+2</span>
          </header>
          <p className="talk-note">
            <IconCalendar size={14} />
            The building agenda is published by management. A private booking stays off this list.
          </p>
          {meetings && upcoming.length === 0 && past.length === 0 && (
            <p className="talk-empty">Nothing is on the agenda yet.</p>
          )}
          <ul>
            {upcoming.map((meeting) => (
              <AgendaRow key={meeting.id} meeting={meeting} open={openId === meeting.id} onToggle={() => setOpenId(openId === meeting.id ? null : meeting.id)} />
            ))}
            {past.map((meeting) => (
              <AgendaRow key={meeting.id} meeting={meeting} open={openId === meeting.id} onToggle={() => setOpenId(openId === meeting.id ? null : meeting.id)} />
            ))}
          </ul>
        </section>

        <aside className="talk-aside">
          <span className="talk-aside-icon">
            <IconCalendar size={18} />
          </span>
          <h2>A focused conversation. Time set aside for you.</h2>
          <p>Choose a 30-minute slot, add your topic, and Anthony Aour receives it on WhatsApp.</p>
          <ul>
            <li><IconCheck size={15} /> Weekdays · 09:00–15:30</li>
            <li><IconCheck size={15} /> 30 minutes with the chairman</li>
            <li><IconCheck size={15} /> Private subjects stay off the shared agenda</li>
          </ul>
          <button type="button" className="talk-choose" onClick={() => setOpen(true)}>
            Choose a time <IconArrowRight size={15} />
          </button>
        </aside>
      </div>

      {open && <BookingDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function AgendaRow({ meeting, open, onToggle }: { meeting: ResidentMeeting; open: boolean; onToggle: () => void }) {
  const date = beirutParts(meeting.startsAt);
  return (
    <li>
      <button type="button" className="talk-row" onClick={onToggle} aria-expanded={open}>
        <time dateTime={meeting.startsAt}>
          <strong>{date.day}</strong>
          <span>{date.month}</span>
        </time>
        <span className="talk-row-copy">
          <em>{date.time}{meeting.location ? ` · ${meeting.location}` : ''}</em>
          <strong>{meeting.title}</strong>
          {meeting.summary && <span>{meeting.summary}</span>}
        </span>
      </button>
      {open && (
        <div className="talk-detail">
          {meeting.agenda.length > 0 && (
            <ol>
              {meeting.agenda.map((item, index) => (
                <li key={item.id}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{item.title}</strong>
                    {item.detail && <p>{item.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {meeting.location && (
            <p className="talk-where">
              <IconMapPin size={13} /> {meeting.location}
            </p>
          )}
          {meeting.status === 'HELD' && meeting.notes && (
            <div className="mtg-notes">
              <p>Notes</p>
              {meeting.notes}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function BookingDialog({ onClose }: { onClose: () => void }) {
  const { account } = useAuth();
  const days = useMemo(upcomingWeekdays, []);
  const [date, setDate] = useState(days[0]?.value ?? '');
  const [slot, setSlot] = useState('10:00');
  const [topic, setTopic] = useState('');
  const [details, setDetails] = useState('');
  const [visibility, setVisibility] = useState<'shared' | 'private'>('private');

  function submit(e: FormEvent) {
    e.preventDefault();
    const day = days.find((item) => item.value === date);
    const home = account?.unit ? `Block ${account.unit.block}, ${account.unit.number}` : 'Garden View';
    const lines = [
      'Garden View — meeting request',
      '',
      `From: ${account?.name ?? 'A resident'}`,
      `Home: ${home}`,
      '',
      `Date: ${day?.label ?? date}`,
      `Time: ${slot}–${slotEnd(slot)} (30 minutes, Beirut time)`,
      `Topic: ${topic.trim()}`,
      details.trim() ? `Details: ${details.trim()}` : 'Details: —',
      visibility === 'private'
        ? 'Agenda: Private. Please keep this off the shared agenda.'
        : 'Agenda: Shared. Happy for the subject to appear on the building agenda.',
    ];
    const url = `https://wa.me/${ANTHONY_WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  }

  return (
    <div className="svc-drawer-back" onClick={onClose}>
      <form className="talk-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header>
          <div>
            <p>Meet management</p>
            <h2>Let’s make time.</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            <IconClose size={18} />
          </button>
        </header>
        <p className="talk-dialog-lede">Choose a 30-minute slot. All times are local to Beirut. It opens WhatsApp to Anthony Aour with this request written out.</p>

        <label>
          Choose a date
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Available times</legend>
          <div className="talk-slots">
            {SLOTS.map((item) => (
              <button key={item} type="button" className={item === slot ? 'is-on' : ''} onClick={() => setSlot(item)} aria-pressed={item === slot}>
                {item}
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          Meeting topic
          <input required value={topic} placeholder="What would you like to discuss?" onChange={(e) => setTopic(e.target.value)} />
        </label>

        <label>
          Details
          <span>optional</span>
          <textarea rows={4} value={details} placeholder="Anything useful to know beforehand?" onChange={(e) => setDetails(e.target.value)} />
        </label>

        <label>
          Agenda visibility
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'shared' | 'private')}>
            <option value="private">Private</option>
            <option value="shared">Shared agenda</option>
          </select>
        </label>
        <p className="talk-hint">
          {visibility === 'private'
            ? 'Private subjects are sent only to Anthony. They are not added to the building agenda.'
            : 'You are asking for the subject to be listed on the shared agenda. Anthony confirms that.'}
        </p>

        <button type="submit" className="talk-choose">
          Send on WhatsApp <IconArrowRight size={15} />
        </button>
      </form>
    </div>
  );
}
