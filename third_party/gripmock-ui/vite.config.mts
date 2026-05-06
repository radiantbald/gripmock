import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
    },
    base: './',
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('/node_modules/')) {
                        return;
                    }

                    if (id.includes('/node_modules/fuse.js/')) {
                        return 'vendor-matches';
                    }

                    if (id.includes('/node_modules/@microlink/react-json-view/')) {
                        return 'vendor-json-view';
                    }

                    if (
                        id.includes('/node_modules/react-dom/') ||
                        id.includes('/node_modules/react/') ||
                        id.includes('/node_modules/scheduler/')
                    ) {
                        return 'vendor-react';
                    }

                    if (
                        id.includes('/node_modules/react-router/') ||
                        id.includes('/node_modules/react-router-dom/')
                    ) {
                        return 'vendor-router';
                    }

                    if (
                        id.includes('/node_modules/@mui/') ||
                        id.includes('/node_modules/@emotion/') ||
                        id.includes('/node_modules/@popperjs/core/')
                    ) {
                        return 'vendor-ui';
                    }

                    if (
                        id.includes('/node_modules/ra-core/') ||
                        id.includes('/node_modules/ra-ui-materialui/') ||
                        id.includes('/node_modules/react-admin/')
                    ) {
                        return 'vendor-admin';
                    }

                    if (id.includes('/node_modules/@tanstack/')) {
                        return 'vendor-query';
                    }

                    return 'vendor-misc';
                },
                chunkFileNames: 'assets/chunk-[name]-[hash].js',
                entryFileNames: 'assets/app-[name]-[hash].js',
            },
        }
    }
});
