/**
 * lib/gemini.ts
 * Handles all Gemini API calls:
 *  1. extractHPOFromText  – free text → HPO term list
 *  2. prioritizeGenesWithLLM – hiPHIVE-style chain-of-thought ranking
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { HPOTerm, GeneResult, HPOGeneAssociation } from "@/types";

// ── Gemini client ─────────────────────────────────────────────────────────────

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in environment variables.");
  return new GoogleGenerativeAI(key);
}

async function callGemini(prompt: string, retries = 3): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,   // low temperature = more deterministic clinical output
      maxOutputTokens: 4096,
    },
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (!text) throw new Error("Empty response from Gemini");
      return text;
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Error && err.message.includes("429");
      if (isRateLimit && attempt < retries) {
        // Wait 4 seconds before retry on rate limit
        await new Promise((r) => setTimeout(r, 4000 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Gemini call failed after retries");
}

// ── 1. Extract HPO terms from free text ──────────────────────────────────────

export async function extractHPOFromText(
  text: string
): Promise<{ terms: HPOTerm[]; cleaned: string }> {
  const prompt = `
You are a clinical genetics expert trained in the Human Phenotype Ontology (HPO).
Your task: extract all clinical phenotype observations from the text below and map each to the best-matching HPO term.

Rules:
- Return ONLY a JSON object with no markdown, no backticks, no preamble.
- Every entry must have both "id" (format: HP:XXXXXXX) and "name" fields.
- Use the most specific HPO term available.
- Ignore non-phenotypic text (demographics, treatment, etc.)
- If you are uncertain about a mapping, omit that term rather than guess.

Input text:
"""
${text}
"""

Return this exact JSON structure:
{
  "terms": [
    { "id": "HP:0001250", "name": "Seizure", "definition": "..." },
    ...
  ],
  "cleaned_summary": "brief restatement of the key phenotypes found"
}
`.trim();

  const raw = await callGemini(prompt);
  const parsed = JSON.parse(raw) as {
    terms: HPOTerm[];
    cleaned_summary: string;
  };

  return {
    terms: parsed.terms ?? [],
    cleaned: parsed.cleaned_summary ?? text,
  };
}

// ── 2. Gene prioritization (hiPHIVE-style chain-of-thought) ──────────────────

export async function prioritizeGenesWithLLM(params: {
  hpoTerms: HPOTerm[];
  hpoAssociations: HPOGeneAssociation[];   // from HPO JAX API
  candidateGenes?: string[];
  literatureContext?: string;
}): Promise<GeneResult[]> {
  const { hpoTerms, hpoAssociations, candidateGenes, literatureContext } = params;

  // Build the gene-phenotype map for context
  const geneMap: Record<string, string[]> = {};
  for (const assoc of hpoAssociations) {
    if (!geneMap[assoc.geneSymbol]) geneMap[assoc.geneSymbol] = [];
    geneMap[assoc.geneSymbol].push(...assoc.hpoTerms);
  }

  const inputTermIds = hpoTerms.map((t) => t.id);
  const inputTermsFormatted = hpoTerms
    .map((t) => `${t.id} (${t.name})`)
    .join(", ");

  // Collect top candidate genes (by HPO overlap first)
  const geneCandidates = candidateGenes?.length
    ? candidateGenes
    : Object.entries(geneMap)
        .map(([symbol, terms]) => ({
          symbol,
          overlap: terms.filter((t) => inputTermIds.includes(t)).length,
        }))
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, 50)
        .map((g) => g.symbol);

  const geneContextBlock = geneCandidates
    .map((sym) => {
      const terms = geneMap[sym] ?? [];
      const matched = terms.filter((t) => inputTermIds.includes(t));
      return `- ${sym}: HPO associations [${terms.slice(0, 10).join(", ")}] | Matched ${matched.length}/${inputTermIds.length} input terms`;
    })
    .join("\n");

  const litBlock = literatureContext
    ? `\n### Relevant Literature Context\n${literatureContext}\n`
    : "";

  const prompt = `
You are an expert clinical geneticist and bioinformatician specializing in rare disease gene discovery.
Your task: rank candidate disease genes by likelihood of causation given a patient's phenotype profile.

### Patient Phenotype Profile
Input HPO terms: ${inputTermsFormatted}

### Candidate Genes (with HPO DB overlap data)
${geneContextBlock}
${litBlock}

### Instructions
Use a hiPHIVE-style reasoning strategy:
1. Assess phenotype similarity: how well does each gene's known phenotype spectrum match the patient's complete HPO profile?
2. Consider phenotype specificity: highly specific terms (e.g. "Kabuki syndrome facial features") carry more weight than broad terms (e.g. "intellectual disability").
3. Account for phenotype completeness: genes covering more of the patient's HPO terms rank higher, all else equal.
4. Apply clinical knowledge about known gene-disease relationships, inheritance patterns, and phenotype expressivity.
5. Note if any genes are strong candidates but not in the HPO DB (from your clinical knowledge).

Return ONLY a JSON array (no markdown, no backticks) of ranked gene objects:
[
  {
    "rank": 1,
    "symbol": "GENE_SYMBOL",
    "name": "Full gene name",
    "llm_confidence": 0.92,
    "matched_hpo_terms": ["HP:0001250", "HP:0000252"],
    "reasoning": "Detailed clinical reasoning (3-5 sentences) explaining why this gene matches.",
    "omim_id": "300672"
  },
  ...
]

Rank up to 20 genes. Only include genes with meaningful phenotypic evidence. Be precise and avoid hallucinating gene-disease relationships you are not certain about.
`.trim();

  const raw = await callGemini(prompt);
  const parsed = JSON.parse(raw) as Array<{
    rank: number;
    symbol: string;
    name?: string;
    llm_confidence: number;
    matched_hpo_terms: string[];
    reasoning: string;
    omim_id?: string;
  }>;

  // Compute HPO match scores and build GeneResult objects
  return parsed.map((item) => {
    const geneHPOTerms = geneMap[item.symbol] ?? [];
    const matchedCount = inputTermIds.filter((t) =>
      geneHPOTerms.includes(t)
    ).length;
    const hpoMatchScore =
      inputTermIds.length > 0 ? matchedCount / inputTermIds.length : 0;
    const llmConf = Math.max(0, Math.min(1, item.llm_confidence ?? 0));

    // Weighted combine: 60% LLM, 40% HPO similarity
    const combinedScore = 0.6 * llmConf + 0.4 * hpoMatchScore;

    return {
      rank: item.rank,
      symbol: item.symbol,
      name: item.name,
      hpoMatchScore: Math.round(hpoMatchScore * 100) / 100,
      llmConfidence: Math.round(llmConf * 100) / 100,
      combinedScore: Math.round(combinedScore * 100) / 100,
      matchedHPOTerms: item.matched_hpo_terms ?? [],
      reasoning: item.reasoning ?? "",
      omimLink: item.omim_id
        ? `https://www.omim.org/entry/${item.omim_id}`
        : undefined,
      validated: false, // filled in by HGNC guard
      literatureSnippets: [],
    } satisfies GeneResult;
  });
}
