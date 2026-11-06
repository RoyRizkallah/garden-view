import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../portal/AuthContext';
import Photo from '../components/Photo';

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
    const from = (location.state as { from?: string } | null)?.from ?? homeFor(account.role);
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const loggedIn = await login(email, password);
      navigate(homeFor(loggedIn.role), { replace: true });
    } catch {
      // error is surfaced through useAuth().error
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rs-login">
      <div className="rs-login-visual">
        <Photo src="/images/shoot/block-c-1.jpg" alt="" sizes="55vw" priority />
        <div className="rs-login-quote">
          <p>Garden View · Beirut Central District</p>
          <h2>One building. Forty-one homes. A quieter way to run it.</h2>
        </div>
      </div>

      <div className="rs-login-form-wrap">
        <div className="rs-login-card">
          <div className="rs-login-brand">
            <img src="/images/logo-icon-128.png" alt="" width={46} height={39} />
            <span>
              <strong>Garden View</strong>
              <span>Beirut Central District</span>
            </span>
          </div>

          <h1>Welcome home.</h1>
          <p className="rs-login-sub">
            Sign in with the account building management set up for your residence.
          </p>

          <form className="rs-login-form" onSubmit={handleSubmit}>
            <label className="rs-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
            </label>

            <label className="rs-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error && (
              <div className="rs-login-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="rs-btn rs-btn-primary" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="rs-login-help">
            Forgotten your password? Building management can reset it for you — no need to create a new
            account.
          </p>

          <Link to="/" className="rs-login-back">
            ← Back to the public site
          </Link>
        </div>
      </div>
    </div>
  );
}
