import type { HandleServerError } from '@sveltejs/kit';

/**
 * Passes an unexpected error's own message to the panel.
 *
 * SvelteKit otherwise replaces it with "Internal Error". The panel shows the
 * message to the operator — "No post with id …", "This post was composed by
 * hand and has nothing to re-fetch." — and its remote commands are only
 * reachable through Cloudflare Access. Everything else, the public output
 * endpoints included, keeps the generic message.
 */
export const handleError: HandleServerError = ({ error, event, status }) => {
	if (status === 404) return { message: 'Not found' };
	console.error(error);
	if (event.isRemoteRequest && error instanceof Error) return { message: error.message };
	return { message: 'Internal Error' };
};
