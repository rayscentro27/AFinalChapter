
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Added type assertion to process to resolve 'Property cwd does not exist on type Process' error
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    root: '.',
    server: {
      port: 3000,
    },
    define: {
      'process.env': {
        API_KEY: env.API_KEY || ''
      }
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
