/**
 * GET /api/hpo?q=seizure
 * Proxies the HPO JAX search API for the frontend autocomplete.
 */

import { NextRequest, NextResponse } from "next/server";
import { searchHPOTerms } from "@/lib/hpo";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (q.length < 2) {
    return NextResponse.json({ terms: [] });
  }

  try {
    const terms = await searchHPOTerms(q);
    return NextResponse.json({ terms });
  } catch (err) {
    console.error("HPO search error:", err);
    return NextResponse.json({ terms: [], error: "HPO search failed" }, { status: 500 });
  }
}
