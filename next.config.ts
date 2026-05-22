import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disabled because admin pages are fully dynamic per user/request.
  cacheComponents: false,
  // pdfkit loads .afm font files relative to its package at runtime; bundling
  // breaks that. exceljs has a similar runtime-resolved module setup.
  serverExternalPackages: ["pdfkit", "exceljs"],
};

export default nextConfig;
