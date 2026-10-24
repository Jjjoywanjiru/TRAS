import axios from 'axios';
import { supabase } from './supabaseClient';

export const API_URL = 'http://127.0.0.1:5000';

// An axios instance that attaches the signed-in user's token to every request,
// so the backend knows who is calling.
const api = axios.create({ baseURL: API_URL, timeout: 20000 }); // give up after 20 s instead of loading forever

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the server says the session is invalid (401), refresh the token once and retry.
// Only if that fails too is the person signed out. A bad connection (no response)
// or a 503 never signs anybody out.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && data.session) {
        original.headers.Authorization = `Bearer ${data.session.access_token}`;
        return api(original);
      }
      await supabase.auth.signOut();
    }
    return Promise.reject(error);
  }
);

export default api;
