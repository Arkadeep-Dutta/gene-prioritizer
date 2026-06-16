"use client";

import { useState, useCallback, useRef } from "react";
import type {
  PrioritizationResponse,
  GeneResult,
  HPOTerm,
  PrioritizationMode,
} from "@/types";

// ─── Tiny icon components (no external deps) ─────────────────────────────────

const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const icons = {
  dna:    "M2 12 C4 6 8 4 12 4 C16 4 20 6 22 12 C20 18 16 20 12 20 C8 20 4 18 2 12Z M8 8 L16 16 M16 8 L8 16",
  search: "M11 11m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M21 21l-4.35-4.35",
  x:      "M18 6 6 18M6 6l12 12",
  warn:   "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  link:   "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  spin:   "M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83",
  flask:  "M9 3h6M10 9l-4 9h12L14 9M10 3v6M14 3v6",
};

// ─── HPO Badge component ──────────────────────────────────────────────────────

function HPOBadge({ term, onRemove }: { term: HPOTerm; onRemove?: () => void }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.3)",
      borderRadius: 4, padding: "2px 8px", fontSize: 12, color: "var(--accent)",
      fontFamily: "var(--mono)",
    }}>
      <span style={{ color: "var(--muted)", marginRight: 2 }}>{term.id}</span>
      {term.name}
      {onRemove && (
        <button onClick={onRemove} style={{
          background: "none", color: "var(--muted)", padding: "0 2px",
          marginLeft: 2, lineHeight: 1,
        }}>
          <Icon d={icons.x} size={10} />
        </button>
      )}
    </span>
  );
}

// ─── Score bar component ──────────────────────────────────────────────────────

function ScoreBar({ value, color = "var(--accent)" }: { value: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          width: `${Math.round(value * 100)}%`, height: "100%",
          background: color, borderRadius: 2,
          transition: "width 0.5s ease",
        }} />
      </div>
      <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--muted)", minWidth: 32 }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Gene result card ─────────────────────────────────────────────────────────

function GeneCard({ gene, index }: { gene: GeneResult; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const rankColor =
    index === 0 ? "#ffd700" : index === 1 ? "#c0c0c0" : index === 2 ? "#cd7f32" : "var(--muted)";

  const scoreColor =
    gene.combinedScore > 0.7
      ? "var(--accent)"
      : gene.combinedScore > 0.4
      ? "var(--warn)"
      : "var(--muted)";

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${gene.validated ? "var(--border)" : "rgba(240,80,80,0.3)"}`,
      borderRadius: 8, overflow: "hidden",
      marginBottom: 8,
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "grid",
          gridTemplateColumns: "48px 1fr auto",
          alignItems: "center", gap: 12, padding: "14px 16px",
          cursor: "pointer",
        }}
      >
        {/* Rank */}
        <div style={{
          textAlign: "center", fontFamily: "var(--mono)", fontSize: 18,
          fontWeight: 600, color: rankColor,
        }}>
          #{gene.rank}
        </div>

        {/* Gene info */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: "var(--text)" }}>
              {gene.symbol}
            </span>
            {gene.name && (
              <span style={{ color: "var(--muted)", fontSize: 13 }}>{gene.name}</span>
            )}
            {!gene.validated && (
              <span style={{
                fontSize: 11, background: "rgba(224,82,82,0.15)",
                color: "var(--danger)", border: "1px solid rgba(224,82,82,0.3)",
                borderRadius: 3, padding: "1px 6px",
              }}>
                ⚠ unvalidated
              </span>
            )}
            {gene.exomiserScore !== undefined && (
              <span style={{
                fontSize: 11, background: "rgba(0,144,255,0.1)",
                color: "var(--accent2)", border: "1px solid rgba(0,144,255,0.3)",
                borderRadius: 3, padding: "1px 6px",
              }}>
                Exomiser
              </span>
            )}
          </div>
          <div style={{ marginTop: 6 }}>
            <ScoreBar value={gene.combinedScore} color={scoreColor} />
          </div>
        </div>

        {/* Score bubble + expand */}
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: scoreColor,
          }}>
            {(gene.combinedScore * 100).toFixed(0)}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            {expanded ? "▲ collapse" : "▼ details"}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          borderTop: "1px solid var(--border)",
          padding: "16px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {/* Score breakdown */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12,
          }}>
            {[
              { label: "HPO Database Match", value: gene.hpoMatchScore, color: "var(--accent2)" },
              { label: "LLM Confidence", value: gene.llmConfidence, color: "var(--accent)" },
              ...(gene.exomiserScore !== undefined
                ? [{ label: "Exomiser Score", value: gene.exomiserScore, color: "#a78bfa" }]
                : []),
            ].map((s) => (
              <div key={s.label} style={{
                background: "var(--surface2)", borderRadius: 6, padding: "10px 12px",
              }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>{s.label}</div>
                <ScoreBar value={s.value} color={s.color} />
              </div>
            ))}
          </div>

          {/* Matched HPO terms */}
          {gene.matchedHPOTerms.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Matched HPO Terms
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {gene.matchedHPOTerms.map((t) => (
                  <span key={t} style={{
                    fontFamily: "var(--mono)", fontSize: 11,
                    background: "rgba(0,144,255,0.1)", color: "var(--accent2)",
                    border: "1px solid rgba(0,144,255,0.2)", borderRadius: 3, padding: "1px 6px",
                  }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* AI reasoning */}
          {gene.reasoning && (
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Clinical Reasoning
              </div>
              <div style={{
                background: "var(--surface2)", borderRadius: 6, padding: "12px 14px",
                fontSize: 13, lineHeight: 1.65, color: "var(--text)",
                borderLeft: "3px solid var(--accent)",
              }}>
                {gene.reasoning}
              </div>
            </div>
          )}

          {/* Literature snippets */}
          {gene.literatureSnippets && gene.literatureSnippets.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Literature Evidence
              </div>
              {gene.literatureSnippets.map((snip, i) => (
                <div key={i} style={{
                  background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.2)",
                  borderRadius: 6, padding: "10px 12px", fontSize: 12, color: "var(--text)",
                  marginBottom: 6, lineHeight: 1.6,
                }}>
                  {snip}
                </div>
              ))}
            </div>
          )}

          {/* Links */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {gene.omimLink && (
              <a href={gene.omimLink} target="_blank" rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 12, color: "var(--accent2)",
                  background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.2)",
                  borderRadius: 4, padding: "4px 10px",
                }}>
                <Icon d={icons.link} size={12} /> OMIM
              </a>
            )}
            <a
              href={`https://hpo.jax.org/browse/gene/${encodeURIComponent(gene.symbol)}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 12, color: "var(--accent)",
                background: "rgba(0,212,170,0.08)", border: "1px solid rgba(0,212,170,0.2)",
                borderRadius: 4, padding: "4px 10px",
              }}>
              <Icon d={icons.link} size={12} /> HPO Gene Page
            </a>
            <a
              href={`https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(gene.symbol)}[sym]`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 12, color: "var(--muted)",
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 4, padding: "4px 10px",
              }}>
              <Icon d={icons.link} size={12} /> NCBI
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HPO autocomplete search ─────────────────────────────────────────────────

function HPOSearchInput({ onAdd }: { onAdd: (term: HPOTerm) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HPOTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = useCallback((q: string) => {
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/hpo?q=${encodeURIComponent(q)}`);
        const data = await res.json() as { terms: HPOTerm[] };
        setResults(data.terms ?? []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search HPO terms (e.g. 'seizure', 'HP:0001250')…"
        />
        {loading && (
          <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>
            <Icon d={icons.spin} size={14} />
          </div>
        )}
      </div>
      {results.length > 0 && (
        <div style={{
          position: "absolute", zIndex: 100, top: "calc(100% + 4px)",
          left: 0, right: 0,
          background: "var(--surface2)", border: "1px solid var(--border)",
          borderRadius: 6, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          maxHeight: 260, overflowY: "auto",
        }}>
          {results.map((t) => (
            <div
              key={t.id}
              onClick={() => { onAdd(t); setQuery(""); setResults([]); }}
              style={{
                padding: "10px 14px", cursor: "pointer",
                borderBottom: "1px solid var(--border)",
                display: "flex", gap: 10, alignItems: "flex-start",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", minWidth: 90 }}>
                {t.id}
              </span>
              <div>
                <div style={{ fontSize: 13, color: "var(--text)" }}>{t.name}</div>
                {t.definition && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>
                    {t.definition.slice(0, 100)}{t.definition.length > 100 ? "…" : ""}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  // Input state
  const [freeText, setFreeText] = useState("");
  const [hpoTerms, setHpoTerms] = useState<HPOTerm[]>([]);
  const [mode, setMode] = useState<PrioritizationMode>("hybrid");
  const [candidateGenes, setCandidateGenes] = useState("");

  // Result state
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<PrioritizationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<"input" | "results">("input");
  const [expandedWarnings, setExpandedWarnings] = useState(false);

  const addHPOTerm = (term: HPOTerm) => {
    setHpoTerms((prev) =>
      prev.find((t) => t.id === term.id) ? prev : [...prev, term]
    );
  };

  const removeHPOTerm = (id: string) => {
    setHpoTerms((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSubmit = async () => {
    if (!freeText.trim() && hpoTerms.length === 0) {
      setError("Enter either free-text phenotypes or search for HPO terms.");
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/prioritize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeText: freeText.trim() || undefined,
          hpoCodes: hpoTerms.map((t) => t.id),
          mode,
          candidateGenes: candidateGenes
            .split(/[\s,;]+/)
            .map((g) => g.trim().toUpperCase())
            .filter(Boolean),
        }),
      });

      const data = await res.json() as PrioritizationResponse & { error?: string };

      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }

      setResponse(data);
      setActiveTab("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = (freeText.trim().length > 0 || hpoTerms.length > 0) && !loading;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Header ── */}
      <header style={{
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        display: "flex", alignItems: "center", gap: 16, height: 56,
        background: "rgba(10,14,20,0.95)", backdropFilter: "blur(8px)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: "rgba(0,212,170,0.15)",
            border: "1px solid rgba(0,212,170,0.3)", borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--accent)",
          }}>
            <Icon d={icons.flask} size={16} />
          </div>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
              GenePrioritizer
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1 }}>
              Phenotype → Gene Analysis
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {(["input", "results"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "6px 14px", fontSize: 13, fontWeight: 500,
                background: activeTab === tab ? "rgba(0,212,170,0.15)" : "transparent",
                color: activeTab === tab ? "var(--accent)" : "var(--muted)",
                border: `1px solid ${activeTab === tab ? "rgba(0,212,170,0.3)" : "transparent"}`,
                borderRadius: 5,
              }}
            >
              {tab === "input" ? "Input" : `Results${response ? ` (${response.results.length})` : ""}`}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ flex: 1, maxWidth: 960, margin: "0 auto", padding: "24px 16px", width: "100%" }}>

        {/* ══ INPUT TAB ══ */}
        {activeTab === "input" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Clinical disclaimer */}
            <div style={{
              background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.25)",
              borderRadius: 8, padding: "12px 16px",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <span style={{ color: "var(--warn)", marginTop: 1 }}><Icon d={icons.warn} size={16} /></span>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--warn)" }}>Research use only.</strong> This tool provides prioritization
                suggestions to support clinical geneticists — it is not a diagnostic device. All results must
                be validated by a qualified clinician before any clinical decision is made.
              </div>
            </div>

            {/* Free text input */}
            <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Clinical Description</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  Describe phenotypes in plain language — Gemini will extract and map to HPO terms automatically.
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="e.g. 5-year-old with intellectual disability, absent speech, hypotonia, seizures, and small head circumference…"
                  rows={5}
                  style={{ resize: "vertical" }}
                />
              </div>
            </section>

            {/* HPO term selector */}
            <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>HPO Terms</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  Search and add specific HPO codes. Can be used alone or combined with the description above.
                </div>
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <HPOSearchInput onAdd={addHPOTerm} />
                {hpoTerms.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {hpoTerms.map((t) => (
                      <HPOBadge key={t.id} term={t} onRemove={() => removeHPOTerm(t.id)} />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Settings row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Mode */}
              <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Prioritization Mode</div>
                {([
                  ["hybrid", "Hybrid (Recommended)", "LLM + HPO database — best accuracy"],
                  ["llm_only", "LLM Only", "Gemini reasoning, no database"],
                  ["hpo_only", "HPO DB Only", "Pure overlap score, no LLM"],
                ] as const).map(([val, label, desc]) => (
                  <label key={val} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8, cursor: "pointer",
                  }}>
                    <input
                      type="radio"
                      name="mode"
                      value={val}
                      checked={mode === val}
                      onChange={() => setMode(val)}
                      style={{ width: "auto", marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{desc}</div>
                    </div>
                  </label>
                ))}
              </section>

              {/* Candidate genes */}
              <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Candidate Genes (optional)</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
                  Restrict analysis to a specific gene panel. Comma-separated gene symbols.
                </div>
                <textarea
                  value={candidateGenes}
                  onChange={(e) => setCandidateGenes(e.target.value)}
                  placeholder="e.g. CDKL5, MECP2, SCN1A, FOXG1, RETT…"
                  rows={4}
                  style={{ fontSize: 12, resize: "vertical", fontFamily: "var(--mono)" }}
                />
              </section>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: "rgba(224,82,82,0.1)", border: "1px solid rgba(224,82,82,0.3)",
                borderRadius: 6, padding: "12px 16px", color: "var(--danger)", fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                padding: "14px 24px", fontSize: 15, fontWeight: 600,
                background: canSubmit ? "var(--accent)" : "var(--border)",
                color: canSubmit ? "#0a0e14" : "var(--muted)",
                borderRadius: 8, width: "100%",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {loading ? (
                <>
                  <Icon d={icons.spin} size={16} />
                  Analyzing phenotypes…
                </>
              ) : (
                <>
                  <Icon d={icons.search} size={16} />
                  Prioritize Genes
                </>
              )}
            </button>

            {loading && (
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 8, padding: 20, textAlign: "center",
              }}>
                <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8 }}>
                  Running analysis pipeline…
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--muted)" }}>
                  {freeText && <div>① Extracting HPO terms from text via Gemini</div>}
                  <div>② Querying HPO JAX gene-phenotype database</div>
                  <div>③ Running hiPHIVE chain-of-thought reasoning</div>
                  <div>④ Validating gene symbols against HGNC</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ RESULTS TAB ══ */}
        {activeTab === "results" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!response ? (
              <div style={{
                textAlign: "center", padding: "80px 24px",
                color: "var(--muted)", fontSize: 14,
              }}>
                <div style={{ marginBottom: 12, opacity: 0.5 }}>
                  <Icon d={icons.dna} size={48} />
                </div>
                No results yet — run an analysis from the Input tab.
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "14px 16px",
                  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16,
                }}>
                  {[
                    { label: "Genes Ranked", value: response.results.length, color: "var(--accent)" },
                    { label: "HPO Terms", value: response.extractedHPOTerms.length, color: "var(--accent2)" },
                    { label: "Mode", value: response.mode.replace("_", " "), color: "var(--warn)" },
                    { label: "Time", value: `${(response.processingTimeMs / 1000).toFixed(1)}s`, color: "var(--muted)" },
                    ...(response.exomiserUsed ? [{ label: "Exomiser", value: "Active", color: "#a78bfa" }] : []),
                    ...(response.literatureUsed ? [{ label: "Literature", value: "Active", color: "#34d399" }] : []),
                  ].map((s) => (
                    <div key={s.label}>
                      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: 20, fontFamily: "var(--mono)", fontWeight: 600, color: s.color, marginTop: 2 }}>
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Extracted HPO terms */}
                {response.extractedHPOTerms.length > 0 && (
                  <div style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 8, padding: "14px 16px",
                  }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Analyzed Phenotypes
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {response.extractedHPOTerms.map((t) => (
                        <HPOBadge key={t.id} term={t} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {response.warnings.length > 0 && (
                  <div style={{
                    background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.2)",
                    borderRadius: 8, overflow: "hidden",
                  }}>
                    <div
                      onClick={() => setExpandedWarnings(!expandedWarnings)}
                      style={{
                        padding: "10px 16px", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 8,
                        color: "var(--warn)", fontSize: 13,
                      }}>
                      <Icon d={icons.warn} size={14} />
                      {response.warnings.length} warning{response.warnings.length !== 1 ? "s" : ""}
                      <span style={{ marginLeft: "auto", fontSize: 11 }}>{expandedWarnings ? "▲" : "▼"}</span>
                    </div>
                    {expandedWarnings && (
                      <div style={{ padding: "0 16px 12px" }}>
                        {response.warnings.map((w, i) => (
                          <div key={i} style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
                            • {w}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Gene results */}
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Candidate Genes — click any row to expand clinical reasoning
                  </div>
                  {response.results.map((gene, i) => (
                    <GeneCard key={gene.symbol} gene={gene} index={i} />
                  ))}
                </div>

                {/* New analysis button */}
                <button
                  onClick={() => setActiveTab("input")}
                  style={{
                    padding: "10px 20px", background: "var(--surface)",
                    color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6,
                    fontSize: 13, marginTop: 8,
                  }}>
                  ← New Analysis
                </button>
              </>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: "1px solid var(--border)", padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: 11, color: "var(--muted)",
      }}>
        <span>GenePrioritizer — Powered by Gemini AI + HPO JAX + HGNC</span>
        <div style={{ display: "flex", gap: 16 }}>
          <a href="https://hpo.jax.org" target="_blank" rel="noopener noreferrer">HPO</a>
          <a href="https://www.genenames.org" target="_blank" rel="noopener noreferrer">HGNC</a>
          <a href="https://www.omim.org" target="_blank" rel="noopener noreferrer">OMIM</a>
        </div>
      </footer>
    </div>
  );
}
