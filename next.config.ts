import type { NextConfig } from "next";

const deploymentHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

const nextConfig: NextConfig = {
  // `metadataBase` must stay static for `cacheComponents`, so resolve the public
  // origin here (build time) instead of reading Vercel's runtime vars in the layout.
  env: {
    NEXT_PUBLIC_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      (deploymentHost ? `https://${deploymentHost}` : ""),
  },
  cacheComponents: true,
  partialPrefetching: true,
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
