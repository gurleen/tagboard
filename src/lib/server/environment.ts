import { getRequestEvent } from '$app/server';

/**
 * The Cloudflare bindings for the request being handled.
 *
 * Reached through `getRequestEvent()`, so it can be called from anywhere a
 * request is being served — a repository function several `await`s deep
 * included. That relies on `AsyncLocalStorage`, which the `nodejs_als`
 * compatibility flag in `wrangler.jsonc` provides on Workers.
 */
export function bindings(): App.Platform['env'] {
	const environment = getRequestEvent().platform?.env;
	if (!environment) {
		throw new Error(
			'The Cloudflare bindings are unavailable. Run the application with `bun run dev` or `bun run preview`, which provide them.'
		);
	}
	return environment;
}
