import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/db/client";
import { ingestCsv } from "@/lib/ingest/pipeline";
import { MAX_CSV_BYTES, formatBytes } from "@/lib/limits";

export const runtime = "nodejs"; // pipeline uses node:crypto + service code

/**
 * POST /api/ingest — multipart upload of a transactions CSV.
 * Returns IngestSummary { imported, skipped, duplicates, reasons } (SPEC §6).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let csv: string;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "no file provided" }, { status: 400 });
      }
      csv = await file.text();
    } else {
      // Allow a raw text/csv body too (handy for the mock-bank path / tests).
      csv = await request.text();
    }
  } catch {
    return NextResponse.json({ error: "could not read upload" }, { status: 400 });
  }

  if (!csv.trim()) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }

  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
    return NextResponse.json(
      { error: `CSV exceeds the ${formatBytes(MAX_CSV_BYTES)} limit` },
      { status: 413 },
    );
  }

  try {
    const summary = await ingestCsv({ userId: user.id, csv });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
