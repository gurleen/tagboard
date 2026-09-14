import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Tauri sets these when it starts the dev server; they let the config target the
// platform being built rather than the machine doing the building.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
	// Tauri loads the dev server at a fixed URL, so the port must not drift.
	clearScreen: false,
	server: {
		host: host || false,
		port: 5173,
		strictPort: true,
		hmr: host ? { protocol: 'ws', host, port: 5183 } : undefined,
		// The Rust crate is compiled by cargo, not bundled by Vite; watching it
		// only produces spurious reloads.
		watch: { ignored: ['**/src-tauri/**'] },
		allowedHosts: ['5173-mbp.gurleen.net']
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Tauri serves the front end from the file system, so the whole app is
			// prerendered to static files with an SPA fallback for client routing.
			adapter: adapter({ fallback: 'index.html' }),

			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		})
	]
});
