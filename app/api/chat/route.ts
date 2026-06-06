import { type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/db/client";
import { streamAssistantReply } from "@/lib/agent/orchestrator";
import { MAX_MESSAGE_CHARS } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/chat — the orchestrator entrypoint. Streams the assistant reply
 * (narration + typed tool results) back as a UI message stream (SPEC §5).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { messages?: UIMessage[]; conversationId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.messages || body.messages.length === 0) {
    return NextResponse.json({ error: "no messages" }, { status: 400 });
  }

  // Cap the latest user message length to bound model context/cost.
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  const lastUserLen = (lastUser?.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .reduce((n, p) => n + p.text.length, 0);
  if (lastUserLen > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `message exceeds the ${MAX_MESSAGE_CHARS}-character limit` },
      { status: 400 },
    );
  }

  const { result } = await streamAssistantReply({
    userId: user.id,
    conversationId: body.conversationId ?? null,
    messages: body.messages,
  });

  return result.toUIMessageStreamResponse();
}
