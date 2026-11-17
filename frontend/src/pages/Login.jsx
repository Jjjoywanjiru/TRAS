import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, HOME_FOR_ROLE } from '../authState';
import { DEMO_ACCOUNTS } from '../demoAccounts';

export default function Login() {
  const { signIn, signOut, retryProfile, profile, profileError, session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="page">Loading...</div>;
  if (profile) return <Navigate to={HOME_FOR_ROLE[profile.role] || '/dashboard'} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) setError('Wrong email or password. Check them and try again.');
    setBusy(false);
  };

  // Signed in with Supabase but the profile could not be loaded: retry or sign out
  if (session && profileError) {
    return (
      <div className="login-wrap">
        <div className="notice err">{profileError}</div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={retryProfile}>Try again</button>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="page-head">
        <h1>Sign in to TRAS</h1>
        <p>Use the account your administrator gave you.</p>
      </div>
      <div className="login-grid">
      <form className="panel" onSubmit={handleSubmit}>
        {error && <div className="notice err">{error}</div>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
        <p className="forgot">Forgot your password? See your administrator.</p>
      </form>

      {DEMO_ACCOUNTS.length > 0 && (
        <section className="demo" aria-label="Try the demo">
          <h2>Try the demo</h2>
          <p className="muted">
            Demonstration only. All patients are made-up. Do not enter real patient information.
            Choose a role to fill in the form, then press Sign in.
          </p>
          <ul className="demo-list">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <div>
                  <strong>{a.role}</strong>
                  <div className="muted">{a.note}</div>
                  <div className="demo-cred">{a.email} / {a.password}</div>
                </div>
                <button type="button" className="btn" onClick={() => { setEmail(a.email); setPassword(a.password); }}>
                  Use
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </div>
  );
}