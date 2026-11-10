import { stringify } from 'devalue';
import type { OutputSnapshot } from '$lib/board/output';
import { authorizeOutput, boardForTarget } from '$lib/server/output';
import { submissionKey, submissionsOpen } from '$lib/server/repository/settings';
import type { RequestHandler } from './$types';

/**
 * The board an output is showing, polled by the output page, together with the
 * submission key when the board draws a submission QR code.
 *
 * Serialised with devalue rather than JSON so timestamps arrive as `Date`, the
 * same as they do in the panel.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	await authorizeOutput(url);
	const record = await boardForTarget(params.target);
	const showsCode = record && record.submissionCodePosition !== 'hidden';
	const snapshot: OutputSnapshot = {
		record,
		submissionKey: showsCode && (await submissionsOpen()) ? await submissionKey() : null
	};

	return new Response(stringify(snapshot), {
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};
