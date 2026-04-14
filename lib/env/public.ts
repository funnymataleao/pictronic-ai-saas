export interface PublicSupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * Reads public Supabase environment variables.
 * For Next.js client-side compatibility, we must access these as literal properties
 * of process.env (e.g. process.env.NEXT_PUBLIC_SUPABASE_URL) rather than using dynamic keys.
 */
export function readPublicSupabaseEnv(): PublicSupabaseEnv {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
  };
}
