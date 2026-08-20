import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingIncludes: {
    "/*": ["./agent-mentor/skills/generate-course-from-topic/lessons/**/*"],
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
