import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "localhost",
    port: 8093,
    proxy: {
      "/api": {
        target: "http://localhost:4003",
        changeOrigin: true,
      },
      /* ── Modul Pocokan (dev) ─────────────────────────────────────────
       * Backend HRIS (4003) memasang subapp API (/pocokan-api) dan static
       * dist FE pocokan (/pocokan, base '/pocokan/'). Prefiks "/pocokan/"
       * (dengan slash) menyengaja: route SPA embed HRIS di "/pocokan"
       * tanpa slash tetap dilayani Vite sebagai index HRIS, sedangkan
       * dokumen iframe "/pocokan/" + aset "/pocokan/assets/..." dialihkan
       * ke backend. Begitu juga "/pocokan-api". */
      "/pocokan-api": {
        target: "http://localhost:4003",
        changeOrigin: true,
      },
      "/pocokan/": {
        target: "http://localhost:4003",
        changeOrigin: true,
      },
    },
  },
});
