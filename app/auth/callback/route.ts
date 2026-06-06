import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/db/client";

/**
 * Exchanges the auth `code` for a session (email confirmation / magic link),
 * then redirects into the app. No-op if confirmation is disabled in Supabase.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/chat";

  if (code) {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
