import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production optimizations
  reactStrictMode: true,

  // Optimize images if using external sources
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Experimental: Enable package imports optimization for smaller bundles
  experimental: {
    optimizePackageImports: ["recharts", "framer-motion"],
  },
};

export default nextConfig;
