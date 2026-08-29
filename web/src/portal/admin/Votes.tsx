import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type AdminVote } from '../api';
import VoteDonut from '../VoteDonut';

const CHOICE_LABEL: Record<'YES' | 'NO' | 'ABSTAIN', string> = { YES: 'Yes', NO: 'No', ABSTAIN: 'Abstain' };
const CHOICE_COLOR: Record<'YES' | 'NO' | 'ABSTAIN', string> = {
  YES: 'var(--green)',
  NO: '#c05a44',
  ABSTAIN: 'var(--gold)',
};

export default function AdminVotes() {
  const [votes, setVotes] = useState<AdminVote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api
      .get<{ votes: AdminVote[] }>('/admin/votes')
      .then((res) => setVotes(res.votes))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/admin/votes', {
        title: form.get('title'),
        description: form.get('description') || undefined,
        closesAt: form.get('closesAt'),
      });
      (e.target as HTMLFormElement).reset();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create proposal.');
    } finally {
      setSubmitting(false);
    }
  }

  async function closeVote(id: string) {
    await api.patch(`/admin/votes/${id}/close`);
    load();
  }

  return (
    <div className="portal-page">
      <p className="eyebrow">Votes</p>
      <h1>Manage Building Proposals</h1>

      <form className="portal-request-panel" onSubmit={handleCreate} style={{ marginBottom: 44 }}>
        <div className="portal-inline-form">
          <div className="form-field">
            <label htmlFor="title">Proposal Title</label>
            <input id="title" name="title" required />
          </div>
          <div className="form-field">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" rows={2} />
          </div>
          <div className="form-field">
            <label htmlFor="closesAt">Closes On</label>
            <input id="closesAt" name="closesAt" type="date" required />
          </div>
          {error && <div className="note-card">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Proposal'}
          </button>
        </div>
      </form>

      <div className="portal-vote-list">
        {votes?.map((v) => {
          const leadChoice = (['YES', 'NO', 'ABSTAIN'] as const).reduce((lead, choice) =>
            (v.tally[choice] ?? 0) > (v.tally[lead] ?? 0) ? choice : lead,
          'YES' as 'YES' | 'NO' | 'ABSTAIN');
          const leadPct = v.totalVotes > 0 ? Math.round(((v.tally[leadChoice] ?? 0) / v.totalVotes) * 100) : 0;

          return (
            <div key={v.id} className="portal-vote-card">
              <div className="portal-vote-head">
                <div>
                  <span className={`portal-badge portal-badge-${v.status.toLowerCase()}`}>
                    {v.status}
                  </span>
                  <h3>{v.title}</h3>
                  {v.description && <p>{v.description}</p>}
                </div>
                {v.status === 'OPEN' && (
                  <button className="btn btn-outline btn-sm" onClick={() => closeVote(v.id)}>
                    Close Vote
                  </button>
                )}
              </div>

              <div className="portal-vote-result">
                <VoteDonut
                  segments={(['YES', 'NO', 'ABSTAIN'] as const).map((choice) => ({
                    value: v.tally[choice] ?? 0,
                    color: CHOICE_COLOR[choice],
                  }))}
                  centerLabel={v.totalVotes > 0 ? `${leadPct}%` : '—'}
                  centerSub={v.totalVotes > 0 ? CHOICE_LABEL[leadChoice] : 'No votes'}
                />
                <ul className="portal-vote-legend">
                  {(['YES', 'NO', 'ABSTAIN'] as const).map((choice) => {
                    const count = v.tally[choice] ?? 0;
                    const pct = v.totalVotes > 0 ? Math.round((count / v.totalVotes) * 100) : 0;
                    return (
                      <li key={choice}>
                        <span className="portal-vote-legend-dot" style={{ background: CHOICE_COLOR[choice] }} />
                        <span className="portal-vote-legend-label">{CHOICE_LABEL[choice]}</span>
                        <span className="portal-vote-legend-value">
                          {count} <em>{pct}%</em>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <p className="portal-vote-meta">
                Closes {new Date(v.closesAt).toLocaleDateString()} · {v.totalVotes} unit
                {v.totalVotes === 1 ? '' : 's'} voted
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
