import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

function origin(raw: string | undefined): string | null {
  try {
    return raw ? new URL(raw).origin : null;
  } catch {
    return null;
  }
}

function contentSecurityPolicy(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const rpcs = (env.VITE_NEAR_RPC_URL ?? "").split(",").map((u) => origin(u.trim()));
  const connect = [...new Set(["'self'", ...rpcs, origin(env.VITE_API_URL)].filter(Boolean))].join(" ");
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "brinewar-csp",
    apply: "build",
    transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }],
  };
}

function siteUrl(mode: string): Plugin {
  const site = origin(loadEnv(mode, process.cwd(), "VITE_").VITE_SITE_URL);
  return {
    name: "brinewar-site-url",
    apply: "build",
    buildStart() {
      if (!site) throw new Error("VITE_SITE_URL must be the public origin, e.g. https://example.org: link previews need absolute URLs");
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), contentSecurityPolicy(mode), siteUrl(mode)],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    proxy: process.env.BRINEWAR_API_PROXY ? { "/api": { target: process.env.BRINEWAR_API_PROXY, changeOrigin: true } } : undefined,
  },
  preview: {
    proxy: process.env.BRINEWAR_API_PROXY ? { "/api": { target: process.env.BRINEWAR_API_PROXY, changeOrigin: true } } : undefined,
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (id.includes("node_modules/three") || id.includes("@react-three")) return "three";
          if (id.includes("near-api-js") || id.includes("@near-js") || id.includes("@noble")) return "near";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**"],
    coverage: { include: ["src/lib/**", "src/game/**"], reporter: ["text-summary", "text"] },
  },
}));
