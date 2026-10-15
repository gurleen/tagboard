import * as v from 'valibot';
import { command } from '$app/server';
import { BOARD_LAYOUTS, BOARD_TRANSITIONS } from '$lib/database/schema';
import * as boards from '$lib/server/repository/boards';

/**
 * The control panel's access to the board repository. See the note in
 * `posts.remote.ts`.
 */

const identifier = v.pipe(v.string(), v.uuid());
const count = (maximum: number) =>
	v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(maximum));
const duration = (minimum: number, maximum: number) =>
	v.pipe(v.number(), v.integer(), v.minValue(minimum), v.maxValue(maximum));

const boardTheme = v.object({
	backgroundColor: v.string(),
	surfaceColor: v.string(),
	textColor: v.string(),
	accentColor: v.string(),
	fontFamily: v.string(),
	textScale: v.pipe(v.number(), v.minValue(0.25), v.maxValue(4)),
	cornerRadiusPx: v.pipe(v.number(), v.minValue(0), v.maxValue(256)),
	backgroundImagePath: v.optional(v.string())
});

/**
 * Fields the board editor can change. Anything else in the patch is dropped, so
 * this cannot be used to set `isLive` around {@link setLiveBoard}.
 */
const boardPatch = v.partial(
	v.object({
		name: v.pipe(v.string(), v.trim(), v.nonEmpty()),
		description: v.nullable(v.string()),
		layout: v.picklist(BOARD_LAYOUTS),
		columnCount: count(8),
		rowCount: count(8),
		rotationIntervalMs: duration(1000, 600_000),
		transition: v.picklist(BOARD_TRANSITIONS),
		transitionDurationMs: duration(0, 10_000),
		showMetrics: v.boolean(),
		showTimestamp: v.boolean(),
		showPlatformBadge: v.boolean(),
		theme: boardTheme
	})
);

/** What {@link updateBoard} accepts, for the board editor to type its fields against. */
export type BoardPatch = v.InferInput<typeof boardPatch>;

export const listBoards = command(() => boards.listBoards());

export const createBoard = command(v.string(), (name) => boards.createBoard(name));

export const updateBoard = command(
	v.object({ boardId: identifier, patch: boardPatch }),
	({ boardId, patch }) => boards.updateBoard(boardId, patch)
);

export const deleteBoard = command(identifier, (boardId) => boards.deleteBoard(boardId));

export const requireBoard = command(identifier, (boardId) => boards.requireBoard(boardId));

export const setLiveBoard = command(v.nullable(identifier), (boardId) =>
	boards.setLiveBoard(boardId)
);

export const listEntries = command(identifier, (boardId) => boards.listEntries(boardId));

export const addPostsToBoard = command(
	v.object({ boardId: identifier, postIds: v.array(identifier) }),
	({ boardId, postIds }) => boards.addPostsToBoard(boardId, postIds)
);

export const removeEntry = command(identifier, (entryId) => boards.removeEntry(entryId));

export const reorderEntries = command(v.array(identifier), (entryIds) =>
	boards.reorderEntries(entryIds)
);

export const setEntryPinned = command(
	v.object({ entryId: identifier, pinned: v.boolean() }),
	({ entryId, pinned }) => boards.setEntryPinned(entryId, pinned)
);
