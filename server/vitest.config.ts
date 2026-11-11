import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20_000,
    coverage: { include: ["src/**/*.ts"], exclude: ["src/**/main.ts", "src/scripts/**"] },
  },
});
