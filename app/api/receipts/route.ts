import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { generateObject } from "ai";
import { z } from "zod";
import { getCurrentUser, getServerClient } from "@/lib/db/client";
import { visionModel } from "@/lib/agent/models";
import { coerceDate, type ReceiptExtraction, type ReceiptDraft } from "@/lib/contracts";

export const runtime = "nodejs";
export const maxDuration = 30;

const CONFIDENCE_THRESHOLD = 0.7;

// The vision model returns amounts in major units; we convert to cents after.
const VisionSchema = z.object({
  merchant: z.string().nullable(),
  date: z.string().nullable(),
  total: z.number().nullable(),
  currency: z.string().default("USD"),
  lineItems: z.array(z.object({ desc: z.string(), amount: z.number() })).default([]),
  confidence: z.number().min(0).max(1),
});

const EXTRACTION_PROMPT = `You are extracting structured data from a photo of a receipt. The image may be rotated, blurry, partially cut off, or in another language — handle rotation and translate the merchant name to its common form. Extract: merchant name, date, grand total, currency, and line items. Use the GRAND TOTAL (after tax), not the subtotal. Return amounts as decimal numbers in major currency units. Set "confidence" to your honest overall confidence (0-1); use a low value if the image is hard to read or fields are missing. Use null for anything you cannot read.`;

/**
 * POST /api/receipts — image upload → store → vision extract → confidence gate.
 * Always returns a DRAFT that requires explicit confirmation; a low-confidence
 * or incomplete extraction is never silently recorded (SPEC §8).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no image provided" }, { status: 400 });
  }

  const supabase = await getServerClient();
  const receiptId = randomUUID();
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const storagePath = `${user.id}/${receiptId}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  // Store the image (path-scoped RLS confines it to the user's folder).
  const { error: upErr } = await supabase.storage
    .from("receipts")
    .upload(storagePath, bytes, { contentType: file.type || "image/jpeg", upsert: true });
  if (upErr) {
    return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 500 });
  }

  await supabase.from("receipts").insert({
    id: receiptId,
    user_id: user.id,
    storage_path: storagePath,
    status: "pending",
  });

  // Vision extraction. On hard failure, fall back to an empty draft for manual entry.
  let extraction: ReceiptExtraction;
  try {
    const { object } = await generateObject({
      model: visionModel(),
      schema: VisionSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            { type: "image", image: bytes, mediaType: file.type || "image/jpeg" },
          ],
        },
      ],
    });
    extraction = {
      merchant: object.merchant,
      date: coerceDate(object.date),
      total_cents: object.total != null ? Math.round(object.total * 100) : null,
      currency: object.currency ?? "USD",
      lineItems: object.lineItems.map((li) => ({
        desc: li.desc,
        amount_cents: Math.round(li.amount * 100),
      })),
      confidence: object.confidence,
    };
  } catch {
    extraction = {
      merchant: null,
      date: null,
      total_cents: null,
      currency: "USD",
      lineItems: [],
      confidence: 0,
    };
  }

  // Persist the extraction for the record.
  await supabase
    .from("receipts")
    .update({ extracted: extraction, confidence: extraction.confidence })
    .eq("id", receiptId);

  // Confidence gate: flag fields that need review.
  const lowConfidenceFields: string[] = [];
  if (!extraction.merchant) lowConfidenceFields.push("merchant");
  if (!extraction.date) lowConfidenceFields.push("date");
  if (extraction.total_cents == null) lowConfidenceFields.push("total");
  if (extraction.confidence < CONFIDENCE_THRESHOLD && lowConfidenceFields.length === 0) {
    lowConfidenceFields.push("total"); // low overall confidence → review the amount
  }

  const draft: ReceiptDraft = {
    receiptId,
    draft: extraction,
    requiresConfirm: true,
    lowConfidenceFields,
  };
  return NextResponse.json(draft);
}
