/**
 * lib/exomiser.ts
 * REST client for the self-hosted Exomiser service.
 * Only activates when EXOMISER_API_URL is set in environment.
 *
 * See DEPLOYMENT.md for how to set up Exomiser on Railway.
 */

import type { ExomiserGeneScore, HPOTerm } from "@/types";

export function isExomiserConfigured(): boolean {
  return !!process.env.EXOMISER_API_URL;
}

export async function runExomiserPhenotype(params: {
  hpoTerms: HPOTerm[];
  vcfData?: string;
}): Promise<ExomiserGeneScore[]> {
  const baseUrl = process.env.EXOMISER_API_URL;
  if (!baseUrl) {
    throw new Error("EXOMISER_API_URL not configured");
  }

  const { hpoTerms, vcfData } = params;

  // Build Phenopacket-compatible request
  const requestBody = {
    phenopacket: {
      id: `patient_${Date.now()}`,
      phenotypicFeatures: hpoTerms.map((t) => ({
        type: { id: t.id, label: t.name },
        excluded: false,
      })),
      ...(vcfData
        ? {
            htsFiles: [
              {
                htsFormat: "VCF",
                genomeAssembly: "GRCh38",
                uri: `data:text/plain;base64,${Buffer.from(vcfData).toString("base64")}`,
              },
            ],
          }
        : {}),
    },
    analysisMode: vcfData ? "FULL" : "PHENOTYPE_ONLY",
    inheritanceModes: {
      AUTOSOMAL_DOMINANT: 0.1,
      AUTOSOMAL_RECESSIVE: 0.1,
      X_DOMINANT: 0.1,
      X_RECESSIVE: 0.1,
    },
  };

  const response = await fetch(`${baseUrl}/api/v1/analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(60_000), // 60 second timeout
  });

  if (!response.ok) {
    const msg = await response.text().catch(() => "unknown error");
    throw new Error(`Exomiser API error ${response.status}: ${msg}`);
  }

  const data = (await response.json()) as {
    genes?: Array<{
      geneSymbol: string;
      combinedScore: number;
      phenotypeScore: number;
      variantScore: number;
    }>;
  };

  return (data.genes ?? []).map((g) => ({
    geneSymbol: g.geneSymbol,
    combinedScore: g.combinedScore,
    phenotypeScore: g.phenotypeScore,
    variantScore: g.variantScore ?? 0,
  }));
}
