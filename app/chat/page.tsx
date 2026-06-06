import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/db/client";

/**
 * Authenticated shell. This is a minimal placeholder that proves the session
 * round-trip and RLS-bound client work; the full chat UI (thread, composer,
 * result cards, onboarding) is built in PRD-B2.
 */
export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen max-w-[760px] flex-col px-4 py-10">
      <header className="mb-10 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">Finance Assistant</h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm text-text-muted hover:text-text"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center text-center">
        <h2 className="font-display text-2xl font-semibold">
          Welcome{user.email ? `, ${user.email.split("@")[0]}` : ""}.
        </h2>
        <p className="mt-2 max-w-md text-text-muted">
          You&apos;re signed in. Upload your transactions to get started — the
          chat assistant and onboarding flow arrive in the next milestone.
        </p>
        <p className="mt-6 text-xs text-text-faint">
          Signed in as {user.email}
        </p>
      </section>
    </main>
  );
}
