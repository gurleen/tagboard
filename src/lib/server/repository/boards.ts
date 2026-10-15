import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { database, identifierBatches } from '$lib/server/database';
import {
	board,
	boardEntry,
	DEFAULT_BOARD_THEME,
	post,
	type Board,
	type NewBoard
} from '$lib/database/schema';
import type { BoardEntryRecord, BoardRecord } from '$lib/database/records';
import { findPosts } from './posts';

/** Fields the board editor can change. */
export type BoardPatch = Partial<
	Pick<
		NewBoard,
		| 'name'
		| 'description'
		| 'layout'
		| 'columnCount'
		| 'rowCount'
		| 'rotationIntervalMs'
		| 'transition'
		| 'transitionDurationMs'
		| 'showMetrics'
		| 'showTimestamp'
		| 'showPlatformBadge'
		| 'theme'
	>
>;

/** Lists boards oldest first, so the ordering an operator built stays stable. */
export function listBoards(): Promise<Board[]> {
	return database().select().from(board).orderBy(asc(board.createdAt));
}

/** Creates a board with the default look and grid. */
export async function createBoard(name: string): Promise<Board> {
	const [created] = await database()
		.insert(board)
		.values({ name: name.trim() || 'Untitled board', theme: DEFAULT_BOARD_THEME })
		.returning();
	return created;
}

export async function updateBoard(boardId: string, patch: BoardPatch): Promise<void> {
	await database().update(board).set(patch).where(eq(board.id, boardId));
}

/** Deletes a board. Its entries cascade; the posts themselves are untouched. */
export async function deleteBoard(boardId: string): Promise<void> {
	await database().delete(board).where(eq(board.id, boardId));
}

/** Loads one board with its entries, or throws when it is gone. */
export async function requireBoard(boardId: string): Promise<BoardRecord> {
	const record = await findBoard(boardId);
	if (!record) throw new Error(`No board with id ${boardId}.`);
	return record;
}

/** Loads one board with its entries, or `null` when there is no such board. */
export async function findBoard(boardId: string): Promise<BoardRecord | null> {
	const [row] = await database().select().from(board).where(eq(board.id, boardId)).limit(1);
	if (!row) return null;
	return { ...row, entries: await listEntries(boardId) };
}

/**
 * Puts one board on air and takes every other board off it.
 *
 * Both writes go through a batch so the on-air output can never observe two live
 * boards, or none.
 */
export async function setLiveBoard(boardId: string | null): Promise<void> {
	const clear = database().update(board).set({ isLive: false }).where(eq(board.isLive, true));

	if (!boardId) {
		await clear;
		return;
	}

	await database().batch([
		clear,
		database().update(board).set({ isLive: true }).where(eq(board.id, boardId))
	]);
}

/** The board currently on air, or `null` when nothing is. */
export async function liveBoard(): Promise<BoardRecord | null> {
	const [row] = await database().select().from(board).where(eq(board.isLive, true)).limit(1);
	if (!row) return null;
	return { ...row, entries: await listEntries(row.id) };
}

/** The identifier of the board currently on air, or `null` when nothing is. */
export async function liveBoardId(): Promise<string | null> {
	const [row] = await database()
		.select({ id: board.id })
		.from(board)
		.where(eq(board.isLive, true))
		.limit(1);
	return row?.id ?? null;
}

/**
 * Lists a board's entries in display order, each with its post.
 *
 * Entries and posts are read separately rather than joined; see the note on
 * `attachMediaToAll` in the post repository for why. The posts are read together
 * rather than one per entry: every output polls this, and each statement is a
 * round trip to D1.
 */
export async function listEntries(boardId: string): Promise<BoardEntryRecord[]> {
	const entries = await database()
		.select()
		.from(boardEntry)
		.where(eq(boardEntry.boardId, boardId))
		.orderBy(asc(boardEntry.position));

	const posts = new Map(
		(await findPosts(entries.map((entry) => entry.postId))).map((record) => [record.id, record])
	);

	// Entries cascade from their post, so each has one; the guard covers a post
	// deleted between the two reads.
	return entries.flatMap((entry) => {
		const record = posts.get(entry.postId);
		return record ? [{ ...entry, post: record }] : [];
	});
}

/**
 * Adds approved posts to the end of a board.
 *
 * Posts already on the board are skipped rather than duplicated, and posts that
 * are not approved are refused: nothing reaches air without a verdict.
 */
export async function addPostsToBoard(boardId: string, postIds: string[]): Promise<number> {
	if (postIds.length === 0) return 0;

	const approved: { id: string }[] = [];
	for (const batch of identifierBatches(postIds)) {
		approved.push(
			...(await database()
				.select({ id: post.id })
				.from(post)
				.where(and(inArray(post.id, batch), eq(post.reviewState, 'approved'))))
		);
	}

	const existing = await database()
		.select({ postId: boardEntry.postId })
		.from(boardEntry)
		.where(eq(boardEntry.boardId, boardId));
	const present = new Set(existing.map((row) => row.postId));

	const additions = approved.map((row) => row.id).filter((id) => !present.has(id));
	if (additions.length === 0) return 0;

	const [highest] = await database()
		.select({ position: sql<number>`coalesce(max(${boardEntry.position}), -1)` })
		.from(boardEntry)
		.where(eq(boardEntry.boardId, boardId));
	let position = Number(highest?.position ?? -1);

	// One statement per entry, in one batch: a multi-row insert would bind every
	// column of every row and pass D1's limit of 100 bound parameters.
	const [first, ...rest] = additions.map((postId) =>
		database().insert(boardEntry).values({ boardId, postId, position: ++position })
	);
	await database().batch([first, ...rest]);

	return additions.length;
}

/** Removes one entry from a board. The post stays in the library. */
export async function removeEntry(entryId: string): Promise<void> {
	await database().delete(boardEntry).where(eq(boardEntry.id, entryId));
}

/** Rewrites entry positions to match the given order. */
export async function reorderEntries(orderedEntryIds: string[]): Promise<void> {
	if (orderedEntryIds.length === 0) return;

	const updates = orderedEntryIds.map((entryId, position) =>
		database().update(boardEntry).set({ position }).where(eq(boardEntry.id, entryId))
	);
	// `batch` is typed for a non-empty tuple; the guard above establishes that.
	await database().batch(updates as [(typeof updates)[number], ...typeof updates]);
}

/** Pins an entry so it holds its cell instead of rotating out. */
export async function setEntryPinned(entryId: string, pinned: boolean): Promise<void> {
	await database().update(boardEntry).set({ pinned }).where(eq(boardEntry.id, entryId));
}

/**
 * Records that an output has just displayed these entries of a board.
 *
 * Entries of any other board are ignored, so an output can only count airs
 * against the board it is showing.
 */
export async function recordEntriesAired(boardId: string, entryIds: string[]): Promise<void> {
	const [first, ...rest] = identifierBatches(entryIds).map((batch) =>
		database()
			.update(boardEntry)
			.set({ lastAiredAt: new Date(), airCount: sql`${boardEntry.airCount} + 1` })
			.where(and(eq(boardEntry.boardId, boardId), inArray(boardEntry.id, batch)))
	);
	if (first) await database().batch([first, ...rest]);
}
