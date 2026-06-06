import { redirect } from "next/navigation";
import { getCurrentUser, getServerClient } from "@/lib/db/client";
import { ChatApp } from "@/components/chat-app";

/**
 * Authenticated chat route (UI_SPEC §3). Server component: resolves the user,
 * checks whether they have any data yet (to choose onboarding vs chat), then
 * hands off to the client chat shell.
 */
export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await getServerClient();
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return <ChatApp userEmail={user.email ?? null} initialHasData={(count ?? 0) > 0} />;
}
