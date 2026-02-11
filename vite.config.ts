import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 5001,
      host: 'localhost', // 使用 localhost 避免 uv_interface_addresses 报错
    },
    plugins: [react()],
    define: {
      // 'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY), // Removed for security
      // 'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY) // Removed for security
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    base: mode === 'development' ? '/' : '/ad-platform-data-report/', // 本地开发用 /，部署用 GitHub Pages 路径
  };
});
