import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, HOME_FOR_ROLE } from '../authState';

export default function Login() {
  const { signIn, signOut, profile, profileError, session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <div>Loading...</div>;
  if (profile) return <Navigate to={HOME_FOR_ROLE[profile.role] || '/dashboard'} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) setError('Wrong email or password.');
    setBusy(false);
  };

  // Signed in with Supabase but no staff profile: let them sign out
  if (session && profileError) {
    return (
      <div style={{ maxWidth: '380px', margin: '40px auto', fontFamily: 'sans-serif' }}>
        <div style={{ padding: '12px', backgroundColor: '#fff5f5', border: '1px solid #e53e3e', color: '#c53030', marginBottom: '15px' }}>
          {profileError}
        </div>
        <button onClick={signOut} style={{ padding: '8px 16px' }}>Sign out</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '380px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>TRAS Sign in</h2>
      {error && (
        <div style={{ padding: '10px', backgroundColor: '#fff5f5', border: '1px solid #e53e3e', color: '#c53030', marginBottom: '15px' }}>{error}</div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px' }}>
        <div>
          <label>Email</label><br />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '8px' }} />
        </div>
        <div>
          <label>Password</label><br />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '8px' }} />
        </div>
        <button type="submit" disabled={busy} style={{ padding: '10px', backgroundColor: '#2b6cb0', color: 'white', border: 'none', cursor: 'pointer' }}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}