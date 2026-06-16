/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: Do NOT use the `env` block here — it bakes values into the
  // client-side JavaScript bundle, exposing API keys to anyone who
  // inspects the page source. All secret keys live only in lib/ files
  // which run exclusively on the server (Next.js API routes).
  //
  // Environment variables are read at runtime via process.env inside
  // server-only files (lib/gemini.ts, lib/hgnc.ts, lib/hpo.ts, etc.)
  // and are never sent to the browser.
};

export default nextConfig;
