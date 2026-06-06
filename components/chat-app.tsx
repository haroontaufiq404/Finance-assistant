"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Square } from "lucide-react";
import type { ResultCardData, IngestSummary } from "@/lib/contracts";
import { ResultCard } from "./result-card";
import { ImportSummaryCard } from "./import-summary";
import { Onboarding } from "./onboarding";
import { cn } from "@/lib/utils";

/**
 * Chat shell (PRD-B2, UI_SPEC §3): sidebar + streaming thread + composer.
 * Consumes the B1 /api/chat stream via useChat; tool results arrive as typed
 * parts and render as cards. CSV ingest is a separate POST surfaced as a card.
 */
export function ChatApp({
  userEmail,
  initialHasData,
}: {
  userEmail: string | null;
  initialHasData: boolean;
}) {
  const { messages, sendMessage, status, stop } = useChat();
  const [input, setInput] = useState("");
  const [hasData, setHasData] = useState(initialHasData);
  const [importSummary, setImportSummary] = useState<IngestSummary | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";
  const showOnboarding = !hasData && messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, importSummary]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput("");
  }

  return (
    <div className="flex h-screen bg-bg text-text">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface/40 p-4 md:flex">
        <div className="font-display text-lg font-semibold">Finance Assistant</div>
        <div className="mt-6 text-[11px] font-medium uppercase tracking-wider text-text-faint">
          Quick facts
        </div>
        <p className="mt-2 text-xs text-text-faint">
          Ask about spending, budgets, subscriptions, or unusual activity.
        </p>
        <div className="mt-auto">
          <div className="truncate text-xs text-text-faint">{userEmail}</div>
          <form action="/auth/signout" method="post">
            <button type="submit" className="mt-1 text-xs text-text-muted hover:text-text">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-4 py-8">
            {importSummary && (
              <div className="mb-6">
                <ImportSummaryCard summary={importSummary} />
              </div>
            )}

            {showOnboarding ? (
              <Onboarding
                onUploaded={(s) => {
                  setImportSummary(s);
                  setHasData(true);
                }}
                onExample={(t) => send(t)}
              />
            ) : (
              <div className="space-y-6">
                {messages.map((m) => (
                  <MessageTurn key={m.id} message={m} />
                ))}
                {status === "submitted" && <ToolRunning label="Thinking…" />}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-surface/60">
          <div className="mx-auto w-full max-w-[760px] px-4 py-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-end gap-2 rounded border border-border bg-surface p-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Ask about your money…"
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-text-faint"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  className="rounded-sm bg-surface-sunk p-2 text-text-muted hover:text-text"
                  aria-label="Stop"
                >
                  <Square className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="rounded-sm bg-accent p-2 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  aria-label="Send"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

type UIMsg = ReturnType<typeof useChat>["messages"][number];

function MessageTurn({ message }: { message: UIMsg }) {
  const isUser = message.role === "user";

  if (isUser) {
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded bg-surface-sunk px-3 py-2 text-sm">{text}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return part.text ? (
            <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
              {part.text}
            </p>
          ) : null;
        }
        if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
          const card = toCardData(part);
          if (card) return <ResultCard key={i} data={card} />;
          const state = (part as { state?: string }).state;
          if (state && state !== "output-available" && state !== "output-error") {
            return <ToolRunning key={i} label="Looking that up…" />;
          }
        }
        return null;
      })}
    </div>
  );
}

/** Narrow an AI SDK tool part's output to ResultCardData (has a `kind`). */
function toCardData(part: unknown): ResultCardData | null {
  const out = (part as { output?: unknown }).output;
  if (out && typeof out === "object" && "kind" in out) {
    return out as ResultCardData;
  }
  return null;
}

function ToolRunning({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-faint">
      <span className="flex gap-1">
        <span className={cn("h-1.5 w-1.5 animate-pulse rounded-full bg-text-faint")} />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-faint [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-faint [animation-delay:300ms]" />
      </span>
      {label}
    </div>
  );
}
