import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, HOME_FOR_ROLE } from '../authState';

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
      </form>
    </div>
  );
}
