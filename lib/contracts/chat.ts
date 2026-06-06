import { z } from "zod";

/** Chat roles persisted to the messages table (schema.sql messages.role). */
export const ChatRole = z.enum(["user", "assistant", "tool"]);
export type ChatRole = z.infer<typeof ChatRole>;

/**
 * A chat message as persisted (schema messages) and as exchanged with the
 * orchestrator. UI-only transport (e.g. AI SDK UIMessage parts) lives in B2;
 * this is the storage/transport contract the server owns.
 */
export const ChatMessage = z.object({
  role: ChatRole,
  content: z.string().nullable(),
  tool_calls: z.unknown().nullable().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/** POST /api/chat request body. */
export const ChatRequest = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  messages: z.array(ChatMessage).min(1),
});
export type ChatRequest = z.infer<typeof ChatRequest>;
