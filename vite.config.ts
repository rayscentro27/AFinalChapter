
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env for Vite standard behavior (only VITE_ vars are exposed to client).
  loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    root: '.',
    server: {
      port: 3000,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        input: 'index.html',
      },
    },
  };
});
