import { error } from '@sveltejs/kit';
import { LIVE_OUTPUT_TARGET } from '$lib/board/output';
import type { BoardRecord } from '$lib/database/records';
import { findBoard, liveBoard, liveBoardId } from '$lib/server/repository/boards';
import { isOutputKey } from '$lib/server/repository/settings';

/**
 * Shared by the endpoints under `/output/[target]`, which are reached by OBS
 * rather than by the panel and so are guarded by the output key rather than by
 * Cloudflare Access.
 */

/** Refuses the request unless it carries the current output key. */
export async function authorizeOutput(url: URL): Promise<void> {
	if (!(await isOutputKey(url.searchParams.get('key')))) {
		error(403, 'This output URL is not valid. Copy a fresh one from the control panel.');
	}
}

/**
 * The board an output target shows: the one on air for {@link LIVE_OUTPUT_TARGET},
 * otherwise the board with that identifier. `null` when there is none.
 */
export function boardForTarget(target: string): Promise<BoardRecord | null> {
	return target === LIVE_OUTPUT_TARGET ? liveBoard() : findBoard(target);
}

/** The identifier of the board an output target shows, without reading the board. */
export function boardIdForTarget(target: string): Promise<string | null> {
	return target === LIVE_OUTPUT_TARGET ? liveBoardId() : Promise.resolve(target);
}
