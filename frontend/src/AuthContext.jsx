import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import api from './api';
import { AuthContext } from './authState';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false); // have we checked for an existing session yet?
  const [profile, setProfile] = useState(null); // { id, full_name, role }
  const [profileError, setProfileError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Keep the session in step with Supabase (sign in, sign out, token refresh)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setProfileError(null);
      if (!newSession) setProfile(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // When someone is signed in, ask the backend who they are and what role they have
  useEffect(() => {
    if (!session) return;
    let active = true;
    api.get('/me')
      .then((res) => { if (active) { setProfile(res.data); setProfileError(null); } })
      .catch((err) => {
        if (active) {
          setProfile(null);
          setProfileError(
            err.response?.data?.error || 'Cannot reach the server. Check your connection and try again.'
          );
        }
      });
    return () => { active = false; };
  }, [session, reloadKey]);

  // Loading until we know the session, and, if signed in, until the profile (or an error) arrives
  const loading = !authReady || (!!session && !profile && !profileError);

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();
  const retryProfile = () => { setProfileError(null); setReloadKey((k) => k + 1); };

  return (
    <AuthContext.Provider value={{ session, profile, profileError, loading, signIn, signOut, retryProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
