"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";

/**
 * Floating help button (bottom-right) that opens a modal user manual. Hand-
 * rolled to match the app's token style (no shadcn dependency). Closes on
 * backdrop click, Escape, or the ✕; the close button receives focus on open.
 * Sits above the composer so it never overlaps the send control.
 */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Help"
        title="How to use this app"
        className="fixed bottom-24 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-accent text-white shadow-md transition-opacity hover:opacity-90 md:bottom-6"
      >
        <HelpCircle className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="User manual"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-card-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded border border-border bg-surface p-6 shadow-lg"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">How to use Finance Assistant</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-sm p-1 text-text-muted hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm leading-relaxed">
              <Section title="1. Bring in your data">
                Upload a transactions <strong>CSV</strong> from the welcome screen (or drag &amp;
                drop). Re-uploading the same file is safe — duplicates are skipped, and any unreadable
                rows are reported, never silently dropped.
              </Section>
              <Section title="2. Just ask">
                Talk in plain language. Try:
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text-muted">
                  <li>“How much did I spend on groceries last month?”</li>
                  <li>“What was my biggest purchase in June?”</li>
                  <li>“Am I spending more than usual this month?”</li>
                  <li>“Find my subscriptions” · “Any unusual activity?”</li>
                </ul>
              </Section>
              <Section title="3. Budgets & memory">
                Set a budget (“set a $3000 monthly budget”) and the assistant tracks it, warning as
                you near the limit. Tell it things to remember — “don’t count rent in my budget” or
                “I get paid on the 1st” — and it applies them going forward.
              </Section>
              <Section title="4. Scan a receipt">
                Tap the <strong>paperclip</strong> to upload a receipt photo. The assistant extracts
                the details and shows an editable draft — review it and press <strong>Confirm</strong>
                to record the expense. Nothing is saved without your confirmation.
              </Section>
              <Section title="5. Unknown charges">
                Don’t recognize a charge? Ask “what is this charge: …” and the assistant looks it up
                online and tells you what it likely is — or says honestly if it can’t tell.
              </Section>
              <p className="border-t border-border pt-3 text-xs text-text-faint">
                Your data is private to your account (enforced at the database). Limits: CSV/image
                uploads up to 4&nbsp;MB; messages up to 2,000 characters.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 font-medium text-text">{title}</h3>
      <div className="text-text-muted">{children}</div>
    </div>
  );
}
