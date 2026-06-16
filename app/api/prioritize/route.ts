/**
 * POST /api/prioritize
 * Main orchestration endpoint. Runs all 6 steps in sequence:
 *  1. Parse input (free text or HPO codes)
 *  2. Extract HPO terms via Gemini (if free text)
 *  3. Fetch gene-phenotype associations from HPO JAX API
 *  4. (Optional) Query private literature via Pinecone
 *  5. Prioritize genes via Gemini (hiPHIVE chain-of-thought)
 *  6. Validate gene symbols via HGNC hallucination guard
 *  7. (Optional) Merge Exomiser scores
 */

import { NextRequest, NextResponse } from "next/server";
import { extractHPOFromText, prioritizeGenesWithLLM } from "@/lib/gemini";
import { getGenesForTerms, searchHPOTerms, isValidHPOCode } from "@/lib/hpo";
import { validateGeneSymbols } from "@/lib/hgnc";
import { runExomiserPhenotype, isExomiserConfigured } from "@/lib/exomiser";
import { queryLiterature, isPineconeConfigured } from "@/lib/literature";
import type {
  PrioritizationRequest,
  PrioritizationResponse,
  HPOTerm,
  GeneResult,
} from "@/types";

export const maxDuration = 60; // Vercel function timeout (seconds)

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const warnings: string[] = [];

  try {
    const body = (await req.json()) as PrioritizationRequest;
    const { freeText, hpoCodes = [], mode = "hybrid", candidateGenes, vcfData } = body;

    if (!freeText && hpoCodes.length === 0) {
      return NextResponse.json(
        { error: "Provide either freeText or hpoCodes (or both)." },
        { status: 400 }
      );
    }

    // ── Step 1: Resolve HPO terms ────────────────────────────────────────────

    let resolvedTerms: HPOTerm[] = [];

    // Add any directly-provided HPO codes
    if (hpoCodes.length > 0) {
      const validCodes = hpoCodes.filter(isValidHPOCode);
      if (validCodes.length < hpoCodes.length) {
        warnings.push(
          `${hpoCodes.length - validCodes.length} HPO code(s) had invalid format and were ignored.`
        );
      }
      // Resolve codes to names via HPO search
      const termDetails = await Promise.all(
        validCodes.map(async (code) => {
          const results = await searchHPOTerms(code);
          return results.find((t) => t.id === code) ?? { id: code, name: code };
        })
      );
      resolvedTerms.push(...termDetails);
    }

    // ── Step 2: Extract HPO from free text (if provided) ────────────────────

    if (freeText?.trim()) {
      try {
        const { terms, cleaned } = await extractHPOFromText(freeText);
        if (terms.length === 0) {
          warnings.push(
            `No HPO terms could be extracted from the free text. Try using more specific clinical terms.`
          );
        } else {
          // Merge, deduplicating by ID
          const existingIds = new Set(resolvedTerms.map((t) => t.id));
          const newTerms = terms.filter((t) => !existingIds.has(t.id));
          resolvedTerms.push(...newTerms);
          if (newTerms.length < terms.length) {
            warnings.push(
              `${terms.length - newTerms.length} extracted term(s) were duplicates and merged.`
            );
          }
          void cleaned; // available for future use
        }
      } catch (err) {
        warnings.push(
          `HPO extraction from free text failed: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }

    if (resolvedTerms.length === 0) {
      return NextResponse.json(
        { error: "No valid HPO terms could be resolved from the input." },
        { status: 422 }
      );
    }

    // ── Step 3: Fetch gene-phenotype associations ────────────────────────────

    const hpoIds = resolvedTerms.map((t) => t.id);
    let hpoAssociations = await getGenesForTerms(hpoIds);

    if (hpoAssociations.length === 0) {
      warnings.push(
        "No gene-phenotype associations found in HPO database for the given terms. Results will rely on LLM knowledge only."
      );
    }

    // If user supplied candidate genes, filter to those only
    if (candidateGenes?.length) {
      const candidateSet = new Set(candidateGenes.map((g) => g.toUpperCase()));
      hpoAssociations = hpoAssociations.filter((a) =>
        candidateSet.has(a.geneSymbol.toUpperCase())
      );
    }

    // ── Step 4: Query private literature (optional) ──────────────────────────

    let literatureContext = "";
    const literatureUsed = isPineconeConfigured();

    if (literatureUsed) {
      try {
        const topGenes = hpoAssociations.slice(0, 20).map((a) => a.geneSymbol);
        literatureContext = await queryLiterature({
          hpoTerms: hpoIds,
          geneSymbols: topGenes,
        });
      } catch (err) {
        warnings.push(`Literature query failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    // ── Step 5: Prioritize genes ─────────────────────────────────────────────

    let results: GeneResult[] = [];

    if (mode === "hpo_only") {
      // Pure HPO overlap scoring — no LLM
      results = hpoAssociations.slice(0, 20).map((assoc, idx) => {
        const matchCount = assoc.hpoTerms.filter((t) => hpoIds.includes(t)).length;
        const hpoScore = hpoIds.length > 0 ? matchCount / hpoIds.length : 0;
        return {
          rank: idx + 1,
          symbol: assoc.geneSymbol,
          hpoMatchScore: Math.round(hpoScore * 100) / 100,
          llmConfidence: 0,
          combinedScore: Math.round(hpoScore * 100) / 100,
          matchedHPOTerms: assoc.hpoTerms.filter((t) => hpoIds.includes(t)),
          reasoning: "Ranked by HPO database overlap score only (no LLM used).",
          validated: false,
          literatureSnippets: [],
        } satisfies GeneResult;
      });
    } else {
      // LLM or hybrid — call Gemini
      try {
        results = await prioritizeGenesWithLLM({
          hpoTerms: resolvedTerms,
          hpoAssociations:
            mode === "llm_only" ? [] : hpoAssociations,
          candidateGenes,
          literatureContext,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        // If Gemini fails, fall back to HPO-only
        warnings.push(`LLM prioritization failed (${msg}). Falling back to HPO similarity only.`);
        results = hpoAssociations.slice(0, 20).map((assoc, idx) => {
          const matchCount = assoc.hpoTerms.filter((t) => hpoIds.includes(t)).length;
          const hpoScore = hpoIds.length > 0 ? matchCount / hpoIds.length : 0;
          return {
            rank: idx + 1,
            symbol: assoc.geneSymbol,
            hpoMatchScore: Math.round(hpoScore * 100) / 100,
            llmConfidence: 0,
            combinedScore: Math.round(hpoScore * 100) / 100,
            matchedHPOTerms: assoc.hpoTerms.filter((t) => hpoIds.includes(t)),
            reasoning: "Ranked by HPO overlap (LLM unavailable).",
            validated: false,
            literatureSnippets: [],
          } satisfies GeneResult;
        });
      }
    }

    // ── Step 6: HGNC hallucination guard ────────────────────────────────────

    const symbolsToValidate = results.map((r) => r.symbol);
    const validationMap = await validateGeneSymbols(symbolsToValidate);

    results = results
      .map((r) => {
        const validation = validationMap.get(r.symbol.toUpperCase());
        if (!validation) return r;

        if (!validation.valid) {
          warnings.push(
            `Gene "${r.symbol}" could not be confirmed in HGNC and may be a hallucination. It has been flagged.`
          );
          return { ...r, validated: false };
        }

        // Use canonical symbol if different (e.g. alias resolution)
        const canonical = validation.canonical ?? r.symbol;
        const omimLink = validation.entry?.omimId
          ? `https://www.omim.org/entry/${validation.entry.omimId}`
          : r.omimLink;

        return {
          ...r,
          symbol: canonical,
          name: r.name ?? validation.entry?.name,
          omimLink,
          validated: true,
        };
      })
      .filter(Boolean) as GeneResult[];

    // ── Step 7: Merge Exomiser scores (optional) ─────────────────────────────

    const exomiserUsed = isExomiserConfigured();

    if (exomiserUsed) {
      try {
        const exomiserScores = await runExomiserPhenotype({
          hpoTerms: resolvedTerms,
          vcfData,
        });

        const exMap = new Map(
          exomiserScores.map((s) => [s.geneSymbol.toUpperCase(), s])
        );

        results = results.map((r) => {
          const ex = exMap.get(r.symbol.toUpperCase());
          if (!ex) return r;

          const exScore = ex.combinedScore;
          // Re-weight: 40% LLM + 30% HPO + 30% Exomiser
          const newCombined =
            0.4 * r.llmConfidence + 0.3 * r.hpoMatchScore + 0.3 * exScore;

          return {
            ...r,
            exomiserScore: Math.round(exScore * 100) / 100,
            combinedScore: Math.round(newCombined * 100) / 100,
          };
        });

        // Re-rank after Exomiser merge
        results = results
          .sort((a, b) => b.combinedScore - a.combinedScore)
          .map((r, i) => ({ ...r, rank: i + 1 }));
      } catch (err) {
        warnings.push(
          `Exomiser scoring failed: ${err instanceof Error ? err.message : "unknown"}. Results reflect LLM + HPO only.`
        );
      }
    }

    const response: PrioritizationResponse = {
      extractedHPOTerms: resolvedTerms,
      results,
      warnings,
      mode,
      exomiserUsed,
      literatureUsed,
      processingTimeMs: Date.now() - startTime,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("Prioritization error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}
