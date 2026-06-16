/**
 * POST /api/validate-genes
 * Validates a list of gene symbols against HGNC.
 * Body: { symbols: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { validateGeneSymbols } from "@/lib/hgnc";

export async function POST(req: NextRequest) {
  try {
    const { symbols } = (await req.json()) as { symbols: string[] };

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: "Provide a non-empty symbols array" }, { status: 400 });
    }

    const resultsMap = await validateGeneSymbols(symbols);
    const results = Object.fromEntries(resultsMap.entries());

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validation failed" },
      { status: 500 }
    );
  }
}
