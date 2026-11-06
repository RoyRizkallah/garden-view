import { useState, type FormEvent } from 'react';
import { useAuth } from '../AuthContext';
import { api, ApiError } from '../api';
import { initials } from '../names';
import PageHeader from '../PageHeader';
import { IconCheck, IconUser, IconShield } from '../../components/Icons';

export default function Profile() {
  const { account } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const form = new FormData(event.currentTarget);
    const newPassword = form.get('newPassword') as string;
    const confirmPassword = form.get('confirmPassword') as string;

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      setSubmitting(false);
      return;
    }

    try {
      await api.patch('/auth/password', {
        currentPassword: form.get('currentPassword'),
        newPassword,
      });
      (event.target as HTMLFormElement).reset();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update your password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rs-page">
      <PageHeader
        kicker="Your account"
        title="My account"
        lede="The details building management holds for your residence, and your sign-in."
      />

      <section className="rs-identity">
        <span className="rs-identity-avatar">{initials(account?.name)}</span>
        <div>
          <h2>{account?.name}</h2>
          <p>{account?.email}</p>
          {account?.unit && (
            <p>
              Block {account.unit.block} · {account.unit.number}
            </p>
          )}
        </div>
      </section>

      <div className="rs-grid rs-grid-2" style={{ marginTop: 18 }}>
        <section className="rs-card" aria-labelledby="details">
          <div className="rs-card-head">
            <h2 id="details">Account details</h2>
          </div>
          <div className="rs-detail-list">
            <div className="rs-detail-row">
              <span>Email</span>
              <strong>{account?.email}</strong>
            </div>
            <div className="rs-detail-row">
              <span>Residence</span>
              <strong>{account?.unit ? `${account.unit.block} · ${account.unit.number}` : '—'}</strong>
            </div>
            <div className="rs-detail-row">
              <span>Account type</span>
              <strong>Resident</strong>
            </div>
            <div className="rs-detail-row">
              <span>Voting</span>
              <strong>One vote per residence</strong>
            </div>
          </div>
          <div className="rs-note" style={{ marginTop: 18 }}>
            <IconUser size={15} />
            <span>
              To change your name, email or residence, contact building management — they keep the owner
              directory this account is tied to.
            </span>
          </div>
        </section>

        <section className="rs-card" aria-labelledby="password">
          <div className="rs-card-head">
            <h2 id="password">Password</h2>
          </div>

          <form className="rs-form" onSubmit={handleSubmit}>
            <label className="rs-field">
              <span>Current password</span>
              <input name="currentPassword" type="password" autoComplete="current-password" required />
            </label>

            <label className="rs-field">
              <span>New password</span>
              <input
                name="newPassword"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>

            <label className="rs-field">
              <span>Confirm new password</span>
              <input
                name="confirmPassword"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>

            <p style={{ fontSize: 12, color: 'var(--r-faint)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <IconShield size={12} /> At least 8 characters.
            </p>

            {error && (
              <div className="rs-note">
                <IconShield size={15} />
                <span>{error}</span>
              </div>
            )}

            {success ? (
              <div
                className="rs-note"
                role="status"
                style={{ borderColor: 'rgba(44, 99, 69, 0.35)', color: 'var(--r-ok-ink)' }}
              >
                <IconCheck size={15} />
                <span>Password updated.</span>
              </div>
            ) : (
              <button type="submit" className="rs-btn rs-btn-primary" disabled={submitting}>
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}
