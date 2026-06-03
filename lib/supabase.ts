import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const isBrowser = typeof window !== 'undefined';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeAnonKey = supabaseAnonKey || 'placeholder-anon-key';

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!browserClient) {
    browserClient = createClient(safeUrl, safeAnonKey, {
      auth: {
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
        detectSessionInUrl: isBrowser
      },
      realtime: {
        params: { eventsPerSecond: 10 }
      }
    });
  }
  return browserClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient() as any;
    const value = client[prop as keyof SupabaseClient];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
