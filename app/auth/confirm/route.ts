import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/db/client";

/**
 * Server-side email confirmation (the canonical @supabase/ssr pattern). The
 * email template points here with a `token_hash` + `type`; verifyOtp establishes
 * the session via cookies (server-side), so there's no implicit/hash flow and
 * the user lands authenticated. Pair with a correct Site URL in Supabase so the
 * link points at this deployment, not localhost.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/chat";

  if (token_hash && type) {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_invalid`);
}
