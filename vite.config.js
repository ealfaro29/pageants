import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [react()],
    base: '/', // Absolute paths for BrowserRouter on custom domain
    resolve: {
        alias: [
            {
                find: /^lucide-react$/,
                replacement: fileURLToPath(new URL('./src/lucide-icons.js', import.meta.url))
            }
        ]
    },
    server: {
        proxy: {
            '/api/roblox': {
                target: 'https://thumbnails.roblox.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/roblox/, '')
            }
        }
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true
    }
});
