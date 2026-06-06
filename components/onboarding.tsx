"use client";

import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import type { IngestSummary } from "@/lib/contracts";
import { MAX_CSV_BYTES, formatBytes } from "@/lib/limits";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "How much did I spend on groceries last month?",
  "Find my subscriptions",
  "Am I spending more than usual?",
];

/**
 * Empty/onboarding state (UI_SPEC §4.4): welcome + CSV dropzone + example
 * prompts. On a successful import it hands the summary back to the chat shell.
 */
export function Onboarding({
  onUploaded,
  onExample,
}: {
  onUploaded: (summary: IngestSummary) => void;
  onExample: (text: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    if (file.size > MAX_CSV_BYTES) {
      setError(`That file is too large (max ${formatBytes(MAX_CSV_BYTES)}).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      onUploaded(json as IngestSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <h2 className="font-display text-2xl font-semibold">Welcome.</h2>
      <p className="mt-2 text-text-muted">
        Upload your transactions to get started, then ask me anything about your money.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
        className={cn(
          "mt-8 flex w-full cursor-pointer flex-col items-center gap-2 rounded border border-dashed border-border bg-surface px-6 py-10 transition-colors",
          dragOver && "border-accent bg-[color:var(--accent-soft)]",
        )}
      >
        <Upload className="h-6 w-6 text-text-faint" />
        <span className="text-sm font-medium">
          {busy ? "Importing…" : "Upload transactions (CSV)"}
        </span>
        <span className="text-xs text-text-faint">Drag & drop or click to choose a file</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </label>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => onExample(ex)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-text"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
