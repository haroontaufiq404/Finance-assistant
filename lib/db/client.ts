import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * The ONLY auth/db touchpoint app code may use (SPEC §3, §10). Keeping every
 * Supabase construction here is what makes the auth provider swappable and what
 * guarantees request paths use an RLS-respecting, JWT-bound client — never the
 * service-role key. Do not call createClient / supabase.auth.* anywhere else.
 */

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * RLS-bound Supabase client for the current request. Reads/writes the user's
 * session cookies so `auth.uid()` resolves inside Postgres policies. Use in
 * Server Components, Route Handlers, and Server Actions.
 */
export async function getServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component (cookies are read-only there).
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Resolve the authenticated user, or null. The single identity helper.
 * Uses getUser() (revalidates the JWT) — never getSession() in server code.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Service-role client — bypasses RLS. Server-only, for migrations/seed/admin
 * jobs that are never reachable from a request path (SPEC §10). Never expose.
 */
export function getServiceClient(): SupabaseClient {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
