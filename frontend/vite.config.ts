import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Overridable so a second dev stack can run side-by-side.
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
});
