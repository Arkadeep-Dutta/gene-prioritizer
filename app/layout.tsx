import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GenePrioritizer — Phenotype-to-Gene Analysis",
  description:
    "AI-powered rare disease gene prioritization from HPO phenotypes. Combines Gemini LLM reasoning with HPO database gene-phenotype associations.",
  keywords: ["gene prioritization", "HPO", "rare disease", "clinical genetics", "bioinformatics"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
