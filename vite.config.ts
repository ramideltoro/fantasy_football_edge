import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3101",
      "/auth": "http://127.0.0.1:3101",
    },
  },
  build: { outDir: "dist" },
});
