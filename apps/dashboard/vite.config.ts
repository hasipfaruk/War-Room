import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  // Ports are shared with the server through the repository-root .env file.
  const env = loadEnv(mode, repoRoot, "");
  return {
    plugins: [react()],
    server: {
      port: Number(env.DASHBOARD_PORT || 5173),
      strictPort: true,
      proxy: { "/api": { target: `http://127.0.0.1:${env.SERVER_PORT || 4000}`, changeOrigin: true } },
    },
  };
});
