import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dashboard build. Wrangler serves dist/web as static assets, so the app is a
// plain SPA hitting the same-origin /api — and in dev Vite proxies both /api and
// /mcp to the Worker, so the Simulator and the Tests tab work without a build.
const apiTarget = process.env.GIT_TRACE_API_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  root: fileURLToPath(new URL("./src/web", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src/web", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/mcp": { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/web", import.meta.url)),
    emptyOutDir: true,
  },
});
