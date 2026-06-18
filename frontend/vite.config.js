import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://api.staging.redappletech.com',
        changeOrigin: true,
        // rewrite: (path) => `/cicd${path}`,  // enable when using staging URL
        headers: {
          'x-api-key': '71d0dee2086b3ed51ebedd45b95f0cbc0542f18f6ebdb85073994010b833569f',
        },
      },
    },
  };
});
