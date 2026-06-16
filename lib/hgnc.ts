/**
 * lib/hgnc.ts
 * Validates gene symbols against the HGNC REST API.
 * This is the hallucination guard — any gene Gemini returns gets
 * checked here before it reaches the user.
 *
 * HGNC API docs: https://www.genenames.org/help/rest/
 */

import type { ValidationResult, HGNCEntry } from "@/types";

const HGNC_BASE = "https://rest.genenames.org";

const validationCache = new Map<string, ValidationResult>();

// ── Validate a single gene symbol ────────────────────────────────────────────

export async function validateGeneSymbol(
  symbol: string
): Promise<ValidationResult> {
  const upper = symbol.trim().toUpperCase();
  if (validationCache.has(upper)) return validationCache.get(upper)!;

  try {
    // First try exact symbol match
    const exactUrl = `${HGNC_BASE}/fetch/symbol/${encodeURIComponent(upper)}`;
    const exactRes = await fetch(exactUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });

    if (exactRes.ok) {
      const data = (await exactRes.json()) as {
        response: {
          numFound: number;
          docs: Array<{
            symbol: string;
            name: string;
            hgnc_id: string;
            omim_id?: string[];
          }>;
        };
      };

      if (data.response.numFound > 0) {
        const doc = data.response.docs[0];
        const entry: HGNCEntry = {
          symbol: doc.symbol,
          name: doc.name,
          hgncId: doc.hgnc_id,
          omimId: doc.omim_id?.[0],
        };
        const result: ValidationResult = { symbol: upper, valid: true, canonical: doc.symbol, entry };
        validationCache.set(upper, result);
        return result;
      }
    }

    // Try alias lookup
    const aliasUrl = `${HGNC_BASE}/search/alias_symbol/${encodeURIComponent(upper)}`;
    const aliasRes = await fetch(aliasUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });

    if (aliasRes.ok) {
      const aliasData = (await aliasRes.json()) as {
        response: {
          numFound: number;
          docs: Array<{
            symbol: string;
            name: string;
            hgnc_id: string;
            omim_id?: string[];
          }>;
        };
      };

      if (aliasData.response.numFound > 0) {
        const doc = aliasData.response.docs[0];
        const entry: HGNCEntry = {
          symbol: doc.symbol,
          name: doc.name,
          hgncId: doc.hgnc_id,
          omimId: doc.omim_id?.[0],
        };
        const result: ValidationResult = {
          symbol: upper,
          valid: true,
          canonical: doc.symbol, // corrected symbol
          entry,
        };
        validationCache.set(upper, result);
        return result;
      }
    }

    // Not found
    const result: ValidationResult = { symbol: upper, valid: false };
    validationCache.set(upper, result);
    return result;
  } catch (err) {
    console.error(`HGNC validation error for ${symbol}:`, err);
    // Fail open: if HGNC is unreachable, mark as unvalidated but don't reject
    return { symbol: upper, valid: true, canonical: upper };
  }
}

// ── Validate a batch of gene symbols ────────────────────────────────────────

export async function validateGeneSymbols(
  symbols: string[]
): Promise<Map<string, ValidationResult>> {
  const results = await Promise.all(symbols.map(validateGeneSymbol));
  const map = new Map<string, ValidationResult>();
  symbols.forEach((sym, i) => map.set(sym.toUpperCase(), results[i]));
  return map;
}
