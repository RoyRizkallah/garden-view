import { useState, type FormEvent } from 'react';
import { useAuth } from '../AuthContext';
import { api, ApiError } from '../api';
import { IconUser, IconCheck } from '../../components/Icons';

export default function Profile() {
  const { account } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const initial = account?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    const form = new FormData(e.currentTarget);
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
      (e.target as HTMLFormElement).reset();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal-page">
      <p className="eyebrow">Profile</p>
      <h1>My Account</h1>

      <div className="portal-profile-card">
        <span className="portal-avatar portal-avatar-lg">{initial}</span>
        <div>
          <strong>{account?.name}</strong>
          <span>{account?.email}</span>
          {account?.unit && <span>Unit {account.unit.block}-{account.unit.number}</span>}
        </div>
      </div>

      <p className="portal-booking-step">Change Password</p>
      <div className="portal-request-panel">
        <form className="portal-inline-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="currentPassword">Current Password</label>
            <input id="currentPassword" name="currentPassword" type="password" required />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="newPassword">New Password</label>
              <input id="newPassword" name="newPassword" type="password" minLength={8} required />
            </div>
            <div className="form-field">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input id="confirmPassword" name="confirmPassword" type="password" minLength={8} required />
            </div>
          </div>
          {error && <div className="note-card">{error}</div>}
          {success ? (
            <div className="portal-success-chip">
              <IconCheck size={16} /> Password updated.
            </div>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Updating…' : 'Update Password'}
            </button>
          )}
        </form>
      </div>

      <div className="portal-empty-card" style={{ marginTop: 8 }}>
        <IconUser size={22} />
        <p>Need to update your name, email, or unit assignment? Contact building management directly.</p>
      </div>
    </div>
  );
}
