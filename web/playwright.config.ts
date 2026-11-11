import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL,
    viewport: { width: 1280, height: 800 },
  },
});
