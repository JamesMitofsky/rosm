import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit/integration test runner. Default environment is node (pure logic + API
// route handlers); browser-flavored suites opt into jsdom per file with a
// `// @vitest-environment jsdom` docblock.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    // Isolate mock/env/global tampering between tests.
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["lib/**", "store/**", "hooks/**", "app/api/**"],
      reporter: ["text", "html"],
    },
  },
});
