/**
 * lib/hpo.ts
 * Wraps the public HPO JAX API (https://hpo.jax.org/api)
 * - searchTerms: autocomplete / search HPO terms
 * - getGenesForTerm: get all genes associated with an HPO term
 * - getGenesForTerms: aggregate across multiple terms
 */

import type { HPOTerm, HPOGeneAssociation } from "@/types";

const HPO_BASE = "https://hpo.jax.org/api/hpo";

// Cache to avoid re-fetching the same term genes repeatedly
const geneCache = new Map<string, HPOGeneAssociation[]>();

// ── Search HPO terms ──────────────────────────────────────────────────────────

export async function searchHPOTerms(query: string): Promise<HPOTerm[]> {
  if (!query.trim()) return [];

  const url = `${HPO_BASE}/search?q=${encodeURIComponent(query)}&max=20&category=terms`;
  const res = await fetch(url, { next: { revalidate: 3600 } });

  if (!res.ok) {
    console.error(`HPO search failed: ${res.status}`);
    return [];
  }

  const data = (await res.json()) as {
    terms?: Array<{ id: string; name: string; definition?: string }>;
  };

  return (data.terms ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    definition: t.definition,
  }));
}

// ── Get genes for a single HPO term ─────────────────────────────────────────

async function getGenesForTerm(hpoId: string): Promise<HPOGeneAssociation[]> {
  if (geneCache.has(hpoId)) return geneCache.get(hpoId)!;

  const url = `${HPO_BASE}/term/${encodeURIComponent(hpoId)}/genes?max=500`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
    if (!res.ok) return [];

    const data = (await res.json()) as {
      genes?: Array<{ geneId: string; geneSymbol: string }>;
    };

    const associations: HPOGeneAssociation[] = (data.genes ?? []).map((g) => ({
      geneId: String(g.geneId),
      geneSymbol: g.geneSymbol,
      hpoTerms: [hpoId],
    }));

    geneCache.set(hpoId, associations);
    return associations;
  } catch {
    return [];
  }
}

// ── Aggregate genes across multiple HPO terms ────────────────────────────────

export async function getGenesForTerms(
  hpoIds: string[]
): Promise<HPOGeneAssociation[]> {
  if (!hpoIds.length) return [];

  // Fetch all in parallel
  const results = await Promise.all(hpoIds.map(getGenesForTerm));

  // Merge: build geneSymbol → all matched HPO terms
  const merged = new Map<string, HPOGeneAssociation>();

  for (let i = 0; i < hpoIds.length; i++) {
    const termId = hpoIds[i];
    for (const assoc of results[i]) {
      const existing = merged.get(assoc.geneSymbol);
      if (existing) {
        if (!existing.hpoTerms.includes(termId)) {
          existing.hpoTerms.push(termId);
        }
      } else {
        merged.set(assoc.geneSymbol, {
          geneId: assoc.geneId,
          geneSymbol: assoc.geneSymbol,
          hpoTerms: [termId],
        });
      }
    }
  }

  // Sort by number of matched terms descending
  return Array.from(merged.values()).sort(
    (a, b) => b.hpoTerms.length - a.hpoTerms.length
  );
}

// ── Validate that a string looks like an HPO code ────────────────────────────

export function isValidHPOCode(s: string): boolean {
  return /^HP:\d{7}$/.test(s.trim());
}

// ── Parse a mixed input string into HPO codes + free text ────────────────────

export function parseHPOInput(input: string): {
  codes: string[];
  remaining: string;
} {
  const tokens = input.split(/[\s,;]+/);
  const codes: string[] = [];
  const rest: string[] = [];

  for (const token of tokens) {
    if (isValidHPOCode(token)) {
      codes.push(token.trim());
    } else {
      rest.push(token);
    }
  }

  return { codes, remaining: rest.join(" ").trim() };
}
