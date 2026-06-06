import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client for the auth screen only (sign-in/sign-up set the
 * session cookies the server then reads). App data access goes through the
 * server client in client.ts, not this.
 */
export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
