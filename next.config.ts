import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // 661+ static pages; under CPU contention the default 60s per-page cap
  // aborts the whole build. Raise it so builds survive a loaded machine.
  staticPageGenerationTimeout: 240,
  outputFileTracingIncludes: {
    "/*": ["./courses/**/*"],
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
