import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://api.staging.redappletech.com',
        changeOrigin: true,
        rewrite: (path) => `/cicd${path}`,
        headers: {
          'x-api-key': '68cabce716aed0dc7865009d83e572427de6575b1cfdc3741822067b489884c6',
        },
      },
    },
  },
});
