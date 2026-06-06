import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

/**
 * Model resolution (PRD-B1, SPEC §2). Tiers are chosen via env vars as
 * `provider:model` strings, so swapping a provider is a one-line change with no
 * code edits. NEVER hard-code model ids in business logic — call these helpers.
 */

let googleProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;
let anthropicProvider: ReturnType<typeof createAnthropic> | null = null;

function google() {
  return (googleProvider ??= createGoogleGenerativeAI());
}
function anthropic() {
  return (anthropicProvider ??= createAnthropic());
}

function resolve(spec: string): LanguageModel {
  const idx = spec.indexOf(":");
  if (idx === -1) {
    throw new Error(`Invalid model spec "${spec}" — expected "provider:model".`);
  }
  const provider = spec.slice(0, idx);
  const modelId = spec.slice(idx + 1);
  switch (provider) {
    case "google":
      return google()(modelId);
    case "anthropic":
      return anthropic()(modelId);
    default:
      throw new Error(
        `Unsupported model provider "${provider}". Add it in lib/agent/models.ts.`,
      );
  }
}

function fromEnv(name: string): LanguageModel {
  const spec = process.env[name];
  if (!spec) throw new Error(`Missing required env var: ${name}`);
  return resolve(spec);
}

/** Cheap orchestrator / router + Tier-0/1 narration (SPEC §2). */
export const routerModel = (): LanguageModel => fromEnv("ROUTER_MODEL");

/** Vision tier for receipt OCR (used by C1). */
export const visionModel = (): LanguageModel => fromEnv("VISION_MODEL");

/** Reasoning tier for synthesis + agentic work (Tier 3/4). */
export const reasoningModel = (): LanguageModel => fromEnv("REASONING_MODEL");
