/**
 * POST /api/literature
 * Ingest a PDF paper into the Pinecone RAG database.
 * Body: { pdfBase64: string, source: string }
 * Requires PINECONE_API_KEY + PINECONE_INDEX env vars.
 */

import { NextRequest, NextResponse } from "next/server";
import { ingestPDF, isPineconeConfigured } from "@/lib/literature";

export async function POST(req: NextRequest) {
  if (!isPineconeConfigured()) {
    return NextResponse.json(
      { error: "Pinecone is not configured. Set PINECONE_API_KEY and PINECONE_INDEX." },
      { status: 503 }
    );
  }

  try {
    const { pdfBase64, source } = (await req.json()) as {
      pdfBase64: string;
      source: string;
    };

    if (!pdfBase64 || !source) {
      return NextResponse.json(
        { error: "Provide pdfBase64 and source" },
        { status: 400 }
      );
    }

    const result = await ingestPDF({ pdfBase64, source });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingestion failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    configured: isPineconeConfigured(),
    message: isPineconeConfigured()
      ? "Pinecone RAG is active. POST a PDF to ingest it."
      : "Set PINECONE_API_KEY and PINECONE_INDEX to enable literature search.",
  });
}
