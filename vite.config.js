import { defineConfig } from 'vite';

export default defineConfig( {
	base: './',
	build: {
		target: 'es2022',
		assetsInlineLimit: 0,
		chunkSizeWarningLimit: 2000,
		rollupOptions: {
			input: { main: 'index.html' },
			output: {
				manualChunks: { three: [ 'three', 'three/webgpu', 'three/tsl' ] }
			}
		}
	},
	server: { host: true },
	preview: { host: true }
} );
