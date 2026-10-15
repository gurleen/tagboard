import type { Board, BoardEntry, Media, Post } from './schema';

/**
 * Shapes the server hands to the panel and the output, and the pure helpers that
 * read them. Kept apart from the repositories, which are server-only, so client
 * code can use them.
 */

/**
 * A post together with its attachments, which is how the panel always shows one.
 *
 * `rawPayload` is left out: nothing in the interface reads it, and an X payload
 * runs to several kilobytes that every list and every output poll would
 * otherwise carry over the network.
 */
export type PostRecord = Omit<Post, 'rawPayload'> & { media: Media[] };

/** A board slot together with the post it shows. */
export type BoardEntryRecord = BoardEntry & { post: PostRecord };

/** A board together with its ordered entries. */
export type BoardRecord = Board & { entries: BoardEntryRecord[] };

/** The post's avatar asset, if it has one. */
export function avatarOf(record: PostRecord): Media | undefined {
	return record.media.find((asset) => asset.role === 'avatar');
}

/** The post's attachments, in display order. */
export function attachmentsOf(record: PostRecord): Media[] {
	return record.media
		.filter((asset) => asset.role === 'attachment')
		.sort((left, right) => left.position - right.position);
}

/** Posts per page for a board, which is what its grid shape works out to. */
export function pageSize(record: Board): number {
	if (record.layout === 'single') return 1;
	if (record.layout === 'carousel') return Math.max(1, record.columnCount);
	return Math.max(1, record.columnCount * record.rowCount);
}
