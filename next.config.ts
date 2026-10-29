import type { NextConfig } from "next";

const deploymentHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

const nextConfig: NextConfig = {
  // `metadataBase` must stay static, so resolve the public origin here (build
  // time) instead of reading Vercel's runtime vars in the layout.
  env: {
    NEXT_PUBLIC_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      (deploymentHost ? `https://${deploymentHost}` : ""),
  },
  // Cache Components stays off on purpose: every screen fetches its data in the
  // browser, and in Next 16.4 its Instant Navigation gate fails the build on the
  // unknown-param fallback of any dynamic route (`/products/[no]`) with no
  // route-level opt-out (`dynamicParams` is rejected outright).
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
