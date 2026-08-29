import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../portal/AuthContext';

function homeFor(role: string | undefined) {
  return role === 'ADMIN' ? '/admin' : '/portal';
}

export default function Login() {
  const { account, login, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (account) {
    const from = (location.state as { from?: string })?.from ?? homeFor(account.role);
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const loggedInAccount = await login(email, password);
      navigate(homeFor(loggedInAccount.role), { replace: true });
    } catch {
      // error is surfaced via useAuth().error
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login-page">
      <div className="login-card">
        <p className="eyebrow">Garden View</p>
        <h1>Sign In</h1>
        <p className="login-sub">Sign in with the account provided by building management.</p>

        <form className="contact-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <Link to="/" className="login-back">
          ← Back to the public site
        </Link>
      </div>
    </section>
  );
}
