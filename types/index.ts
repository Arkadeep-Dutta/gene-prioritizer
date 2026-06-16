// ─── HPO ──────────────────────────────────────────────────────────────────────

export interface HPOTerm {
  id: string;          // e.g. "HP:0001250"
  name: string;        // e.g. "Seizure"
  definition?: string;
}

export interface HPOSearchResult {
  terms: HPOTerm[];
}

export interface HPOGeneAssociation {
  geneId: string;
  geneSymbol: string;
  hpoTerms: string[];  // list of HP: codes this gene is associated with
}

// ─── Gene Prioritization ──────────────────────────────────────────────────────

export type PrioritizationMode = "hybrid" | "llm_only" | "hpo_only";

export interface PrioritizationRequest {
  freeText?: string;
  hpoCodes?: string[];          // e.g. ["HP:0001250", "HP:0000252"]
  mode: PrioritizationMode;
  candidateGenes?: string[];    // optional user-supplied gene list
  vcfData?: string;             // optional VCF for Exomiser
}

export interface GeneResult {
  rank: number;
  symbol: string;               // e.g. "CDKL5"
  name?: string;
  hpoMatchScore: number;        // 0–1: fraction of input HPO terms in HPO DB for this gene
  llmConfidence: number;        // 0–1: Gemini's assessed confidence
  combinedScore: number;        // weighted merge
  exomiserScore?: number;       // 0–1 if Exomiser is configured
  matchedHPOTerms: string[];    // which input terms matched
  reasoning: string;            // Gemini's chain-of-thought explanation
  omimLink?: string;
  validated: boolean;           // true = confirmed in HGNC
  literatureSnippets?: string[]; // from Pinecone RAG if configured
}

export interface PrioritizationResponse {
  extractedHPOTerms: HPOTerm[];
  results: GeneResult[];
  warnings: string[];
  mode: PrioritizationMode;
  exomiserUsed: boolean;
  literatureUsed: boolean;
  processingTimeMs: number;
}

// ─── HGNC Validation ──────────────────────────────────────────────────────────

export interface HGNCEntry {
  symbol: string;
  name: string;
  hgncId: string;
  omimId?: string;
}

export interface ValidationResult {
  symbol: string;
  valid: boolean;
  canonical?: string;    // corrected symbol if alias found
  entry?: HGNCEntry;
}

// ─── Literature / RAG ─────────────────────────────────────────────────────────

export interface LiteratureChunk {
  text: string;
  source: string;
  score: number;
}

// ─── Exomiser ─────────────────────────────────────────────────────────────────

export interface ExomiserGeneScore {
  geneSymbol: string;
  combinedScore: number;
  phenotypeScore: number;
  variantScore: number;
}
