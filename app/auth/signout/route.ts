import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/db/client";

/** Signs the user out and returns them to /login. */
export async function POST(request: NextRequest) {
  const supabase = await getServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
