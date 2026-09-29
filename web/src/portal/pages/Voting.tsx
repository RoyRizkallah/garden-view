import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type VoteSummary, type VoteChoice } from '../api';
import { IconCheck, IconBallot, IconUser, IconClock } from '../../components/Icons';
import VoteDonut from '../VoteDonut';
import EmptyState from '../EmptyState';

const CHOICE_LABEL: Record<VoteChoice, string> = { YES: 'Yes', NO: 'No', ABSTAIN: 'Abstain' };
const CHOICE_COLOR: Record<VoteChoice, string> = {
  YES: 'var(--green)',
  NO: '#c05a44',
  ABSTAIN: 'var(--gold)',
};

const FILTERS = ['All', 'Open', 'Closed'] as const;
type Filter = (typeof FILTERS)[number];

export default function Voting() {
  const [votes, setVotes] = useState<VoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [castingId, setCastingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('All');

  function load() {
    api
      .get<{ votes: VoteSummary[] }>('/resident/votes')
      .then((res) => setVotes(res.votes))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function castVote(voteId: string, choice: VoteChoice) {
    setCastingId(voteId);
    setError(null);
    try {
      await api.post(`/resident/votes/${voteId}`, { choice });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cast vote.');
    } finally {
      setCastingId(null);
    }
  }

  const awaitingCount = useMemo(() => votes?.filter((v) => v.status === 'OPEN' && !v.myChoice).length ?? 0, [votes]);
  const openCount = votes?.filter((v) => v.status === 'OPEN').length ?? 0;
  const castCount = votes?.filter((v) => v.myChoice).length ?? 0;

  const filtered = useMemo(() => {
    const all = votes ?? [];
    if (filter === 'Open') return all.filter((v) => v.status === 'OPEN');
    if (filter === 'Closed') return all.filter((v) => v.status === 'CLOSED');
    return all;
  }, [votes, filter]);

  function renderResults(v: VoteSummary) {
    const leadChoice = (['YES', 'NO', 'ABSTAIN'] as const).reduce((lead, choice) =>
      (v.tally[choice] ?? 0) > (v.tally[lead] ?? 0) ? choice : lead,
    'YES' as VoteChoice);
    const leadPct = v.totalVotes > 0 ? Math.round(((v.tally[leadChoice] ?? 0) / v.totalVotes) * 100) : 0;

    return (
      <div className="portal-vote-result">
        <svg
          className="portal-vote-result-decoration"
          viewBox="0 0 140 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        >
          <path d="M138 98c-30 4-55-6-70-24-15 18-40 28-70 24" />
          <path d="M100 98V50M100 65c0-12 14-18 24-15-3 12-12 18-24 15Z" />
          <path d="M100 80c0-12-14-18-24-15 3 12 12 18 24 15Z" />
        </svg>
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
                <span
                  className="portal-vote-legend-dot"
                  style={{ background: CHOICE_COLOR[choice] }}
                />
                <span className="portal-vote-legend-label">{CHOICE_LABEL[choice]}</span>
                <span className="portal-vote-legend-value">
                  {count} <em>{pct}%</em>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <div className="portal-page-head-decorated">
        <svg
          className="portal-page-head-decoration"
          viewBox="0 0 220 140"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        >
          <path d="M40 140V50l30-25 30 25v90" />
          <path d="M55 65h8M85 65h8M55 85h8M85 85h8M55 105h8M85 105h8" />
          <path d="M130 140V70h50v70" />
          <path d="M142 82h8M162 82h8M142 100h8M162 100h8M142 118h8M162 118h8" />
        </svg>
        <p className="eyebrow">Voting</p>
        <h1>Building Proposals</h1>
        <p className="portal-page-lede" style={{ marginTop: 0 }}>
          Review community proposals, see results, and make your voice count.
        </p>
      </div>

      {error && <div className="note-card">{error}</div>}

      <div className="portal-stat-grid" style={{ marginBottom: 44 }}>
        <div className="portal-stat-card">
          <span className="portal-stat-icon">
            <IconBallot size={20} />
          </span>
          <span className="portal-stat-label">Open Proposals</span>
          <span className="portal-stat-value">{openCount}</span>
        </div>
        <div className="portal-stat-card">
          <span className="portal-stat-icon">
            <IconCheck size={20} />
          </span>
          <span className="portal-stat-label">Your Participation</span>
          <span className="portal-stat-value">
            {castCount}/{votes?.length ?? 0}
          </span>
        </div>
        <div className="portal-stat-card">
          <span className="portal-stat-icon">
            <IconUser size={20} />
          </span>
          <span className="portal-stat-label">Awaiting Your Vote</span>
          <span className="portal-stat-value">{awaitingCount}</span>
        </div>
      </div>

      <div className="portal-section-head">
        <h2>Proposals</h2>
        <div className="portal-filter-tabs">
          {FILTERS.map((f) => (
            <button key={f} className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="portal-vote-list">
        {filtered.map((v) => {
          const awaiting = v.status === 'OPEN' && !v.myChoice;
          return (
            <div key={v.id} className={`portal-vote-card ${awaiting ? 'portal-vote-card-featured' : ''}`}>
              <div className="portal-vote-head">
                <div>
                  <span className={`portal-badge portal-badge-${v.status.toLowerCase()}`}>{v.status}</span>
                  <h3>{v.title}</h3>
                  {v.description && <p>{v.description}</p>}
                </div>
                {v.myChoice ? (
                  <span className="portal-vote-cast-chip">
                    <IconCheck size={14} /> Voted {CHOICE_LABEL[v.myChoice]}
                  </span>
                ) : awaiting ? (
                  <span className="portal-vote-cast-chip portal-vote-cast-chip-pending">
                    <IconClock size={14} /> Awaiting your vote
                  </span>
                ) : null}
              </div>

              {renderResults(v)}

              <div className="portal-vote-footer">
                <p className="portal-vote-meta">
                  Closes {new Date(v.closesAt).toLocaleDateString()} · {v.totalVotes} unit
                  {v.totalVotes === 1 ? '' : 's'} voted
                </p>
                {awaiting && (
                  <div className="portal-vote-actions">
                    {(['YES', 'NO', 'ABSTAIN'] as const).map((choice) => (
                      <button
                        key={choice}
                        className={`btn btn-sm ${choice === 'YES' ? 'btn-primary' : 'btn-outline'}`}
                        disabled={castingId === v.id}
                        onClick={() => castVote(v.id, choice)}
                      >
                        {CHOICE_LABEL[choice]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {votes && votes.length === 0 && (
          <EmptyState icon={<IconBallot size={22} />} title="No proposals yet">
            When building management puts a decision to the owners, it appears here. Each home has one vote,
            and you can follow the results as they come in.
          </EmptyState>
        )}
        {votes && votes.length > 0 && filtered.length === 0 && <p className="portal-empty-note">No proposals in this view.</p>}
      </div>
    </div>
  );
}
