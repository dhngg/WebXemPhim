import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: environment.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    preview: { port: 4173, strictPort: true },
  };
});
