import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.60", "192.168.0.215", "192.168.0.68", "192.168.0.17", "192.168.0.193", "platr.kaplabs.dev"],
  // Enables React's <ViewTransition> integration so client route navigations
  // animate (crossfade) via the browser View Transitions API. Progressive:
  // unsupported browsers navigate normally; reduced-motion guarded in globals.css.
  experimental: { viewTransition: true },
};

export default nextConfig;
