import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use workspace packages' TS source (the "source" export condition).
    conditions: ["source", ...defaultClientConditions],
  },
  server: {
    port: 5173,
    proxy: {
      // Keep the browser's Host header (the string shorthand rewrites it): the API's CSRF check
      // compares Origin with Host, like it will behind the production reverse proxy.
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: false },
    },
  },
});
