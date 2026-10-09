import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // API key handling is managed externally and injected as process.env.API_KEY automatically.
        // We remove manual definitions to comply with the strictly controlled environment.
      },
      resolve: {
        alias: {
          // Fix: Replaced process.cwd() with '.' to resolve project root correctly
          // and avoid "Property 'cwd' does not exist on type 'Process'" error.
          '@': path.resolve('.'),
        }
      }
    };
});