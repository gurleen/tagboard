import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
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

			// Builds one Cloudflare Worker that serves the client assets and runs every
			// server route. `vite dev` reaches the D1 and R2 bindings declared in
			// `wrangler.jsonc` through Wrangler's local platform proxy.
			adapter: adapter(),

			experimental: {
				// The control panel reaches the server through `command` functions in
				// `src/lib/remote/`. See `docs/architecture.md`.
				remoteFunctions: true
			},

			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		})
	]
});
