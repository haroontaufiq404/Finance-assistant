import { z } from "zod";

/**
 * Deterministic user memory (the "remember context" feature, SPEC §5 / schema
 * user_memory). A discriminated union on `type` so handlers exhaustively switch.
 *
 *  - exclude_category_from_budget: reconfigures the budget query layer (B3),
 *    e.g. "don't count rent in my food budget" -> {exclude:"rent", from:"food"}.
 *  - income_day: a soft fact, e.g. "I get paid on the 1st" -> {day:1}.
 *  - free_text: anything else; stored verbatim, never executed.
 */
export const UserMemoryRule = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("exclude_category_from_budget"),
    exclude: z.string().min(1),
    from: z.string().min(1),
  }),
  z.object({
    type: z.literal("income_day"),
    day: z.number().int().min(1).max(31),
  }),
  z.object({
    type: z.literal("free_text"),
    text: z.string().min(1),
  }),
]);
export type UserMemoryRule = z.infer<typeof UserMemoryRule>;

/** kind discriminator stored alongside the rule (schema user_memory.kind). */
export const MemoryKind = z.enum(["rule", "fact"]);
export type MemoryKind = z.infer<typeof MemoryKind>;
