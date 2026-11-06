import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type VoteSummary, type VoteChoice } from '../api';
import { TOTAL_UNITS } from '../../data/buildingExplorer';
import { shortDate, closesIn } from '../format';
import PageHeader from '../PageHeader';
import VoteDonut from '../VoteDonut';
import { IconCheck, IconBallot, IconClock } from '../../components/Icons';

const CHOICE_LABEL: Record<VoteChoice, string> = { YES: 'Yes', NO: 'No', ABSTAIN: 'Abstain' };
const CHOICE_COLOR: Record<VoteChoice, string> = {
  YES: 'var(--r-green)',
  NO: 'var(--r-danger)',
  ABSTAIN: 'var(--r-gold)',
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
      setError(err instanceof ApiError ? err.message : 'Could not cast your vote.');
    } finally {
      setCastingId(null);
    }
  }

  const awaitingCount = useMemo(
    () => votes?.filter((vote) => vote.status === 'OPEN' && !vote.myChoice).length ?? 0,
    [votes],
  );
  const openCount = votes?.filter((vote) => vote.status === 'OPEN').length ?? 0;
  const castCount = votes?.filter((vote) => vote.myChoice).length ?? 0;

  const filtered = useMemo(() => {
    const list = votes ?? [];
    if (filter === 'All') return list;
    return list.filter((vote) => vote.status === filter.toUpperCase());
  }, [votes, filter]);

  return (
    <div className="rs-page">
      <PageHeader
        kicker="Voting"
        title="Building proposals"
        lede={
          <>
            Decisions the building is making together. Each residence has one vote, and results update as
            votes come in.
          </>
        }
      />

      {error && (
        <div className="rs-note" style={{ marginBottom: 16 }}>
          <IconBallot size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="rs-tiles rs-tiles-3">
        <div className="rs-tile">
          <span className="rs-tile-label">Open proposals</span>
          <strong className="rs-tile-value">{openCount}</strong>
          <span className="rs-tile-note">Accepting votes now</span>
        </div>
        <div className="rs-tile">
          <span className="rs-tile-label">Your participation</span>
          <strong className="rs-tile-value">
            {castCount}
            <span style={{ fontSize: 16, color: 'var(--r-faint)' }}> / {votes?.length ?? 0}</span>
          </strong>
          <span className="rs-tile-note">Proposals you have voted on</span>
        </div>
        <div className="rs-tile">
          <span className="rs-tile-label">Awaiting your vote</span>
          <strong className={`rs-tile-value${awaitingCount > 0 ? ' is-danger' : ' is-ok'}`}>{awaitingCount}</strong>
          <span className="rs-tile-note">
            {awaitingCount > 0 ? 'Your residence has not voted yet' : 'You have voted on everything open'}
          </span>
        </div>
      </div>

      <div className="rs-section-head">
        <h2>Proposals</h2>
        <div className="rs-chip-row" role="group" aria-label="Filter proposals">
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              className={filter === option ? 'is-active' : ''}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {!votes && !error && (
        <div className="rs-note">
          <IconBallot size={15} />
          <span>Loading proposals…</span>
        </div>
      )}

      <div className="rs-vote-list">
        {filtered.map((vote) => {
          const awaiting = vote.status === 'OPEN' && !vote.myChoice;
          const total = Math.max(1, vote.totalVotes);
          const yesPct = Math.round(((vote.tally.YES ?? 0) / total) * 100);

          return (
            <article key={vote.id} className={`rs-vote${awaiting ? ' is-awaiting' : ''}`}>
              <div className="rs-vote-head">
                <div className="rs-vote-title">
                  <span className={`rs-pill ${vote.status === 'OPEN' ? 'is-open' : 'is-neutral'}`}>
                    {vote.status === 'OPEN' ? 'Open' : 'Closed'}
                  </span>
                  <h3>{vote.title}</h3>
                  {vote.description && <p className="rs-vote-desc">{vote.description}</p>}
                </div>

                {vote.myChoice ? (
                  <span className="rs-chip is-cast">
                    <IconCheck size={14} /> Voted {CHOICE_LABEL[vote.myChoice]}
                  </span>
                ) : awaiting ? (
                  <span className="rs-chip is-awaiting">
                    <IconClock size={14} /> Awaiting your vote
                  </span>
                ) : null}
              </div>

              <div className="rs-vote-result">
                <VoteDonut
                  segments={(['YES', 'NO', 'ABSTAIN'] as const).map((choice) => ({
                    value: vote.tally[choice] ?? 0,
                    color: CHOICE_COLOR[choice],
                  }))}
                  size={108}
                  stroke={14}
                  centerLabel={`${yesPct}%`}
                  centerSub="yes"
                />

                <div className="rs-tally">
                  {(['YES', 'NO', 'ABSTAIN'] as const).map((choice) => {
                    const count = vote.tally[choice] ?? 0;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={choice} className="rs-tally-row">
                        <span className="rs-tally-label">{CHOICE_LABEL[choice]}</span>
                        <span className="rs-tally-bar">
                          <span
                            className="rs-tally-fill"
                            style={{ width: `${pct}%`, background: CHOICE_COLOR[choice] }}
                          />
                        </span>
                        <span className="rs-tally-value">
                          <strong>{count}</strong> · {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rs-vote-foot">
                <p className="rs-vote-meta">
                  {vote.status === 'OPEN' ? `${closesIn(vote.closesAt)} · ` : 'Closed '}
                  {shortDate(vote.closesAt)} · {vote.totalVotes} of {TOTAL_UNITS} residences voted
                </p>

                {awaiting && (
                  <div className="rs-vote-actions">
                    {(['YES', 'NO', 'ABSTAIN'] as const).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        className={`rs-btn rs-btn-sm ${
                          choice === 'YES' ? 'rs-btn-primary' : 'rs-btn-outline'
                        }`}
                        disabled={castingId === vote.id}
                        onClick={() => castVote(vote.id, choice)}
                      >
                        {CHOICE_LABEL[choice]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          );
        })}

        {votes && votes.length === 0 && (
          <div className="rs-empty">
            <span className="rs-empty-icon">
              <IconBallot size={20} />
            </span>
            <h2>No proposals yet</h2>
            <p>
              When building management puts a decision to the owners, it appears here. Each home has one
              vote, and you can follow the results as they come in.
            </p>
          </div>
        )}

        {votes && votes.length > 0 && filtered.length === 0 && (
          <div className="rs-empty">
            <p>No proposals in this view.</p>
          </div>
        )}
      </div>
    </div>
  );
}
