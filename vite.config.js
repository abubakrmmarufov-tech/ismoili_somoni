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
				manualChunks: ( id ) => ( id.includes( 'node_modules/three' ) ? 'three' : undefined )
			}
		}
	},
	server: { host: true },
	preview: { host: true }
} );
