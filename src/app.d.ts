import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}

		/**
		 * `@sveltejs/adapter-cloudflare` supplies `ctx`, `caches` and `cf`; `env` is
		 * the bindings declared in `wrangler.jsonc`, and is typed here. Under
		 * `vite dev` they come from Wrangler's local platform proxy.
		 */
		interface Platform {
			env: {
				/** Posts, boards and settings. */
				DATABASE: D1Database;
				/** Cached avatars and attachments, keyed by `media.cached_path`. */
				MEDIA: R2Bucket;
			};
		}
	}
}

export {};
