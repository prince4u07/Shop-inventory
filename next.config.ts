import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Admin/POS pages read auth cookies per request — classic dynamic
  // rendering fits better than Cache Components here.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
