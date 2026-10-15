import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { authorizeOutput, boardIdForTarget } from '$lib/server/output';
import { recordEntriesAired } from '$lib/server/repository/boards';
import type { RequestHandler } from './$types';

const AiredEntries = v.object({ entryIds: v.array(v.pipe(v.string(), v.uuid())) });

/** Counts the entries an output has just put on screen as aired. */
export const POST: RequestHandler = async ({ params, request, url }) => {
	await authorizeOutput(url);

	const parsed = v.safeParse(AiredEntries, await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Expected { entryIds: string[] }.');

	const boardId = await boardIdForTarget(params.target);
	if (boardId) await recordEntriesAired(boardId, parsed.output.entryIds);

	return new Response(null, { status: 204 });
};
