// vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";
import { fileURLToPath, URL } from "node:url";
import inject from "@rollup/plugin-inject";
import pkg from "./package.json";

export default defineConfig({
  // Produksi diserve di bawah origin HRIS: http://<host>:96/pocokan/
  // (unit-test url statis asset menjadi /pocokan/assets/...).
  base: "/pocokan/",
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    inject({
      $: "jquery",
      jQuery: "jquery",
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 8021,
    proxy: {
      "/api": {
        target: "http://localhost:3299",
        changeOrigin: true,
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  optimizeDeps: {
    include: ["jquery", "pivottable"],
  },
});
