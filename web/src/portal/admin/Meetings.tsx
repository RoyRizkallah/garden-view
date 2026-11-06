import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type AdminMeeting, type MeetingStatus } from '../api';
import { IconCalendar } from '../../components/Icons';
import EmptyState from '../EmptyState';

type DraftItem = { title: string; detail: string };
type Draft = {
  id: string | null;
  title: string;
  startsAt: string;
  location: string;
  summary: string;
  notes: string;
  status: MeetingStatus;
  agenda: DraftItem[];
};

const EMPTY: Draft = {
  id: null,
  title: '',
  startsAt: '',
  location: '',
  summary: '',
  notes: '',
  status: 'SCHEDULED',
  agenda: [{ title: '', detail: '' }],
};

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminMeetings() {
  const [meetings, setMeetings] = useState<AdminMeeting[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .get<{ meetings: AdminMeeting[] }>('/admin/meetings')
      .then((res) => setMeetings(res.meetings))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  function edit(meeting: AdminMeeting) {
    setDraft({
      id: meeting.id,
      title: meeting.title,
      startsAt: toLocalInput(meeting.startsAt),
      location: meeting.location ?? '',
      summary: meeting.summary ?? '',
      notes: meeting.notes ?? '',
      status: meeting.status,
      agenda: meeting.agenda.length
        ? meeting.agenda.map((item) => ({ title: item.title, detail: item.detail ?? '' }))
        : [{ title: '', detail: '' }],
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      title: draft.title,
      startsAt: new Date(draft.startsAt).toISOString(),
      location: draft.location,
      summary: draft.summary,
      notes: draft.notes,
      status: draft.status,
      agenda: draft.agenda.filter((item) => item.title.trim()).map((item) => ({ title: item.title.trim(), detail: item.detail.trim() })),
    };
    try {
      if (draft.id) await api.patch(`/admin/meetings/${draft.id}`, body);
      else await api.post('/admin/meetings', body);
      setDraft(EMPTY);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the meeting.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this meeting? Residents will no longer see it.')) return;
    await api.delete(`/admin/meetings/${id}`);
    if (draft.id === id) setDraft(EMPTY);
    load();
  }

  return (
    <div className="portal-page">
      <p className="eyebrow">Meetings</p>
      <h1>Meetings and agendas</h1>
      <p className="portal-page-lede">
        Publish the agenda before the meeting. After it is held, write the notes and residents will see them.
      </p>
      {error && <div className="note-card">{error}</div>}

      <form className="ad-card mtg-admin-form" onSubmit={handleSubmit}>
        <h2>{draft.id ? 'Edit meeting' : 'New meeting'}</h2>
        <div className="form-row">
          <label className="form-field">
            Title
            <input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="form-field">
            Date and time
            <input required type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
          </label>
        </div>
        <div className="form-row">
          <label className="form-field">
            Where
            <input value={draft.location} placeholder="Lobby, or a video link" onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          </label>
          <label className="form-field">
            Status
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as MeetingStatus })}>
              <option value="SCHEDULED">Upcoming</option>
              <option value="HELD">Held — notes are visible</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
        </div>
        <label className="form-field">
          Short introduction
          <textarea rows={2} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
        </label>
        <div className="mtg-admin-agenda">
          <strong>Agenda</strong>
          {draft.agenda.map((item, index) => (
            <div key={index} className="form-row">
              <label className="form-field">
                Item
                <input
                  value={item.title}
                  onChange={(e) => {
                    const agenda = draft.agenda.slice();
                    agenda[index] = { ...item, title: e.target.value };
                    setDraft({ ...draft, agenda });
                  }}
                />
              </label>
              <label className="form-field">
                Detail
                <input
                  value={item.detail}
                  onChange={(e) => {
                    const agenda = draft.agenda.slice();
                    agenda[index] = { ...item, detail: e.target.value };
                    setDraft({ ...draft, agenda });
                  }}
                />
              </label>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setDraft({ ...draft, agenda: [...draft.agenda, { title: '', detail: '' }] })}
          >
            Add agenda item
          </button>
        </div>
        <label className="form-field">
          Notes for residents
          <textarea
            rows={4}
            value={draft.notes}
            placeholder="Shown after you mark the meeting held."
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        <div className="mtg-admin-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? 'Saving…' : draft.id ? 'Save meeting' : 'Publish meeting'}
          </button>
          {draft.id && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setDraft(EMPTY)}>
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <div className="mtg-admin-list">
        {meetings?.map((meeting) => (
          <article key={meeting.id} className="ad-card">
            <header>
              <div>
                <strong>{meeting.title}</strong>
                <span>
                  {new Date(meeting.startsAt).toLocaleString()} · {meeting.status}
                  {meeting.location ? ` · ${meeting.location}` : ''}
                </span>
              </div>
              <div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => edit(meeting)}>
                  Edit
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => remove(meeting.id)}>
                  Delete
                </button>
              </div>
            </header>
            {meeting.agenda.length > 0 && (
              <ol>
                {meeting.agenda.map((item) => (
                  <li key={item.id}>{item.title}</li>
                ))}
              </ol>
            )}
          </article>
        ))}
        {meetings?.length === 0 && (
          <EmptyState icon={<IconCalendar size={22} />} title="No meetings yet">
            Publish a date and an agenda. Residents will see it on their Meetings page.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
