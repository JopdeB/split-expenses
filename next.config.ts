import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disabled because admin pages are fully dynamic per user/request.
  cacheComponents: false,
  // pdfkit loads .afm font files relative to its package at runtime; bundling
  // breaks that. exceljs has a similar runtime-resolved module setup.
  serverExternalPackages: ["pdfkit", "exceljs"],
  // Produces a self-contained .next/standalone dir with only the runtime
  // deps we actually use. Docker image builds off that, so the final layer
  // stays tiny (~150-200 MB) instead of shipping the full node_modules tree.
  output: "standalone",
  // The droplet has 512 MiB RAM; the extra TS-check + lint passes push
  // Node's heap past that. We already run both locally before pushing, so
  // skipping them inside `docker build` on the droplet is safe.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
