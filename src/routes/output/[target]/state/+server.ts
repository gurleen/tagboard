import { stringify } from 'devalue';
import { authorizeOutput, boardForTarget } from '$lib/server/output';
import type { RequestHandler } from './$types';

/**
 * The board an output is showing, polled by the output page.
 *
 * Serialised with devalue rather than JSON so timestamps arrive as `Date`, the
 * same as they do in the panel.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	await authorizeOutput(url);
	const record = await boardForTarget(params.target);

	return new Response(stringify(record), {
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};
