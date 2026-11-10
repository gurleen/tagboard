import { json } from '@sveltejs/kit';
import { createSubmittedPost } from '$lib/server/repository/posts';
import {
	authorizeSubmission,
	readSubmission,
	requireSubmissionsOpen
} from '$lib/server/submission';
import type { RequestHandler } from './$types';

/**
 * Receives a photo and caption from the public submission page and puts it in
 * the review queue. Nothing sent here reaches a board until an operator
 * approves it.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	await authorizeSubmission(url);
	await requireSubmissionsOpen();
	await createSubmittedPost(await readSubmission(request));
	return json({ accepted: true }, { status: 201 });
};
