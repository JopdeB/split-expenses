import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disabled because admin pages are fully dynamic per user/request.
  cacheComponents: false,
};

export default nextConfig;
