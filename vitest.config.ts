import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    // components/**/*.test.tsx: pure functions (SSE parse, state reduce, copy mapping) asserted here.
    // Environment stays node — no jsdom/testing-library; component tests cover extractable logic only,
    // rendering to e2e; real DOM assertions need new deps — separate decision.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "app/**/*.test.tsx", "components/**/*.test.tsx", "tests/**/*.test.ts"],
    // Subprocess tests (export cli / review-crossconsumer / html render) occasionally exceed
    // default 5s under CI load. Not real failures: same tree green locally. 30s removes flake.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
