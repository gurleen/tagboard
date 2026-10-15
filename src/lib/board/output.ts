import { parse } from 'devalue';
import type { BoardRecord } from '$lib/database/records';

/**
 * Bindings to the output endpoints under `/output/[target]`, and the URLs an
 * operator pastes into OBS.
 *
 * An output is addressed either by a board's identifier, which always shows that
 * board, or by {@link LIVE_OUTPUT_TARGET}, which follows whichever board is on
 * air. Every request carries the output key; see `$lib/server/repository/settings`.
 */

/** The output target that follows the board on air. */
export const LIVE_OUTPUT_TARGET = 'live';

/** What one poll of an output found. */
export type OutputState =
	| { status: 'ready'; record: BoardRecord | null }
	/** The key was refused — regenerated since the URL was copied, most likely. */
	| { status: 'refused' }
	/** The server could not be reached or failed; the output keeps what it has. */
	| { status: 'unavailable' };

/** The URL to paste into an OBS browser source. */
export function outputUrl(origin: string, target: string, key: string): string {
	return `${origin}/output/${encodeURIComponent(target)}?key=${encodeURIComponent(key)}`;
}

/** Reads the board an output is showing. */
export async function readOutputState(target: string, key: string): Promise<OutputState> {
	let response: Response;
	try {
		response = await fetch(`${endpoint(target, 'state')}?key=${encodeURIComponent(key)}`, {
			cache: 'no-store'
		});
	} catch {
		return { status: 'unavailable' };
	}

	if (response.status === 403) return { status: 'refused' };
	if (!response.ok) return { status: 'unavailable' };
	return { status: 'ready', record: parse(await response.text()) as BoardRecord | null };
}

/** Records that an output has just displayed these entries. */
export async function recordOutputAired(
	target: string,
	key: string,
	entryIds: string[]
): Promise<void> {
	await fetch(`${endpoint(target, 'aired')}?key=${encodeURIComponent(key)}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ entryIds })
	});
}

function endpoint(target: string, name: 'state' | 'aired'): string {
	return `/output/${encodeURIComponent(target)}/${name}`;
}
