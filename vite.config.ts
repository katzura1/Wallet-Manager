import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "icons/*.svg"],
      manifest: {
        name: "Wallet Manager",
        short_name: "Wallet",
        description: "Personal finance tracker — multi-wallet, income & expense",
        theme_color: "#6366f1",
        background_color: "#0f0f0f",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        shortcuts: [
          {
            name: "Catat Pengeluaran",
            short_name: "Pengeluaran",
            description: "Tambah transaksi pengeluaran baru",
            url: "/?type=expense",
            icons: [{ src: "icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Catat Pemasukan",
            short_name: "Pemasukan",
            description: "Tambah transaksi pemasukan baru",
            url: "/?type=income",
            icons: [{ src: "icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Transfer",
            short_name: "Transfer",
            description: "Transfer saldo antar akun",
            url: "/?type=transfer",
            icons: [{ src: "icons/icon-192.png", sizes: "192x192" }],
          },
        ],
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
