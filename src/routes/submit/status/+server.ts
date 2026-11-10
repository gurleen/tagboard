import { json } from '@sveltejs/kit';
import { authorizeSubmission } from '$lib/server/submission';
import { submissionsOpen } from '$lib/server/repository/settings';
import type { RequestHandler } from './$types';

/** Whether the submission page is accepting photos, asked before it shows the form. */
export const GET: RequestHandler = async ({ url }) => {
	await authorizeSubmission(url);
	return json({ open: await submissionsOpen() }, { headers: { 'cache-control': 'no-store' } });
};
