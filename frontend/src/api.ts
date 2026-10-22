import axios from 'axios';
import { supabase } from './supabaseClient';

export const API_URL = 'http://127.0.0.1:5000';

// An axios instance that attaches the signed-in user's token to every request,
// so the backend knows who is calling.
const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;