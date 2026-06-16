/**
 * lib/literature.ts
 * RAG pipeline using Pinecone vector database.
 * Only activates when PINECONE_API_KEY is set.
 *
 * To ingest papers: POST /api/literature/ingest with PDF base64
 * See DEPLOYMENT.md for full setup.
 */

export function isPineconeConfigured(): boolean {
  return !!(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX);
}

// ── Query Pinecone for relevant literature ────────────────────────────────────

export async function queryLiterature(params: {
  hpoTerms: string[];
  geneSymbols: string[];
  topK?: number;
}): Promise<string> {
  if (!isPineconeConfigured()) return "";

  const { hpoTerms, geneSymbols, topK = 5 } = params;

  const queryText = [
    "Gene-phenotype associations:",
    ...geneSymbols.map((g) => `gene: ${g}`),
    "Phenotypes:",
    ...hpoTerms,
  ].join(" ");

  try {
    // 1. Embed the query using Gemini embeddings
    const embeddingRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: queryText }] },
        }),
      }
    );

    if (!embeddingRes.ok) return "";

    const embData = (await embeddingRes.json()) as {
      embedding: { values: number[] };
    };
    const vector = embData.embedding.values;

    // 2. Query Pinecone
    const pineconeUrl = `https://api.pinecone.io/query`;
    const pineconeRes = await fetch(pineconeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": process.env.PINECONE_API_KEY!,
        "X-Pinecone-API-Version": "2024-07",
      },
      body: JSON.stringify({
        namespace: "",
        index: process.env.PINECONE_INDEX,
        vector,
        topK,
        includeMetadata: true,
      }),
    });

    if (!pineconeRes.ok) return "";

    const pineconeData = (await pineconeRes.json()) as {
      matches: Array<{
        score: number;
        metadata: { text: string; source: string };
      }>;
    };

    const snippets = (pineconeData.matches ?? [])
      .filter((m) => m.score > 0.7)
      .map((m) => `[${m.metadata.source}]: ${m.metadata.text}`);

    return snippets.join("\n\n");
  } catch (err) {
    console.error("Literature query error:", err);
    return "";
  }
}

// ── Ingest a PDF into Pinecone ────────────────────────────────────────────────

export async function ingestPDF(params: {
  pdfBase64: string;
  source: string;
}): Promise<{ chunksIndexed: number }> {
  if (!isPineconeConfigured()) {
    throw new Error("Pinecone not configured");
  }

  // Extract text from PDF via Gemini
  const extractRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: "application/pdf",
                  data: params.pdfBase64,
                },
              },
              {
                text: "Extract all text from this PDF. Return only the extracted text, no commentary.",
              },
            ],
          },
        ],
      }),
    }
  );

  const extractData = (await extractRes.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  const fullText =
    extractData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!fullText) return { chunksIndexed: 0 };

  // Chunk the text (~500 tokens per chunk, 50 token overlap)
  const chunkSize = 2000;
  const overlap = 200;
  const chunks: string[] = [];
  for (let i = 0; i < fullText.length; i += chunkSize - overlap) {
    chunks.push(fullText.slice(i, i + chunkSize));
    if (i + chunkSize >= fullText.length) break;
  }

  // Embed and upsert each chunk
  let indexed = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    const embRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: chunk }] },
        }),
      }
    );

    if (!embRes.ok) continue;

    const embData = (await embRes.json()) as {
      embedding: { values: number[] };
    };

    const upsertRes = await fetch("https://api.pinecone.io/vectors/upsert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": process.env.PINECONE_API_KEY!,
        "X-Pinecone-API-Version": "2024-07",
      },
      body: JSON.stringify({
        namespace: "",
        index: process.env.PINECONE_INDEX,
        vectors: [
          {
            id: `${params.source}_chunk_${i}`,
            values: embData.embedding.values,
            metadata: { text: chunk, source: params.source, chunk: i },
          },
        ],
      }),
    });

    if (upsertRes.ok) indexed++;
  }

  return { chunksIndexed: indexed };
}
