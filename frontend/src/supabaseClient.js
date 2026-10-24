import { createClient } from '@supabase/supabase-js';

// These two come from frontend/.env. Use the PUBLISHABLE (anon) key here,
// never the secret key: anything in the browser is public.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
