import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'https://api.staging.redappletech.com',
          changeOrigin: true,
          rewrite: (path) => `/cicd${path}`,
          headers: {
            'x-api-key': env.DASHBOARD_API_KEY || '',
          },
        },
      },
    },
  };
});
