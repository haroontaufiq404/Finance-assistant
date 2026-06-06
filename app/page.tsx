import { redirect } from "next/navigation";

// The chat is the product (UI_SPEC §3) — there is no separate landing page.
export default function Home() {
  redirect("/chat");
}
