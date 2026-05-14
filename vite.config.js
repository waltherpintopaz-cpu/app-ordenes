import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      external: ["net","tls","crypto","fs","path","os","events","stream","util","buffer","http","https","zlib","url","querystring","assert","child_process"],
      output: {
        manualChunks: {
          "react-vendor":   ["react","react-dom"],
          "charts":         ["recharts"],
          "pdf":            ["jspdf","jspdf-autotable"],
          "map":            ["leaflet","react-leaflet"],
          "supabase":       ["@supabase/supabase-js"],
          "xlsx":           ["xlsx"],
        },
      },
    },
  },
  server: {
    host: true,
    proxy: {
      '/api/mikrowisp': {
        target: 'https://americanet.club',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/mikrowisp/, '/api/v1'),
      },
      '/api/smartolt': {
        target: 'https://americanet.smartolt.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/smartolt/, '/api'),
      },
      '/api/diagnostico-servicio': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
      },
      '/api/olt-ssh': {
        target: 'http://185.173.110.145:3002',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/olt-ssh/, ''),
      },
    },
  },
})
