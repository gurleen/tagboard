import { and, desc, eq, getTableColumns, inArray, like, or, sql } from 'drizzle-orm';
import { database, identifierBatches } from '$lib/server/database';
import {
	media,
	post,
	type Media,
	type MediaKind,
	type NewMedia,
	type Platform,
	type Post,
	type ReviewState
} from '$lib/database/schema';
import type { PostRecord } from '$lib/database/records';
import { normaliseHandle, parsePermalink } from '$lib/ingestion/permalink';
import { fetchPost, type FetchedPost } from '$lib/server/ingestion/fetcher';
import { removeAssets, storeAsset } from '$lib/server/media/storage';

/** Every post column except `rawPayload`; see the note on {@link PostRecord}. */
const postColumns = Object.fromEntries(
	Object.entries(getTableColumns(post)).filter(([name]) => name !== 'rawPayload')
) as Omit<ReturnType<typeof getTableColumns<typeof post>>, 'rawPayload'>;

/** A post row as the panel and output read it. */
type PostRow = Omit<Post, 'rawPayload'>;

/** Narrowing applied to the post list. Every field is optional and ANDed. */
export type PostFilter = {
	reviewState?: ReviewState | ReviewState[];
	platform?: Platform;
	starred?: boolean;
	/** Matched against post body, author name and author handle. */
	search?: string;
	limit?: number;
};

/** What happened when a permalink was submitted. */
export type IngestionOutcome = {
	post: PostRecord;
	/** `existing` means the permalink was already in the library and was not re-fetched. */
	status: 'created' | 'existing';
};

/** Fields the operator fills in when composing a post by hand. */
export type ManualPostInput = {
	authorName: string;
	authorHandle?: string | null;
	body: string;
	platform?: Platform;
	permalink?: string | null;
	postedAt?: Date | null;
	authorVerified?: boolean;
	/** Media URLs to download into the cache, in display order. */
	mediaUrls?: string[];
	avatarUrl?: string | null;
};

/**
 * Ingests a pasted permalink.
 *
 * The post row is written before the fetch is attempted so a provider failure
 * leaves a visible, retryable record rather than nothing at all. Media downloads
 * run after the row is committed and are not awaited by the caller's critical
 * path — see {@link cacheMediaForPost}.
 */
export async function ingestPermalink(input: string): Promise<IngestionOutcome> {
	const reference = parsePermalink(input);

	const existing = await database()
		.select(postColumns)
		.from(post)
		.where(
			and(eq(post.platform, reference.platform), eq(post.platformPostId, reference.platformPostId))
		)
		.limit(1);

	if (existing.length > 0) {
		return { post: await attachMedia(existing[0]), status: 'existing' };
	}

	const [created] = await database()
		.insert(post)
		.values({
			platform: reference.platform,
			origin: 'url',
			platformPostId: reference.platformPostId,
			permalink: reference.permalink,
			authorName: reference.authorHandle ?? 'Unknown author',
			authorHandle: reference.authorHandle,
			body: '',
			resolutionState: 'resolving',
			reviewState: 'pending'
		})
		.returning({ id: post.id });

	try {
		const fetched = await fetchPost(reference);
		await applyFetchedPost(created.id, fetched);
	} catch (error) {
		await database()
			.update(post)
			.set({
				resolutionState: 'failed',
				resolutionError: error instanceof Error ? error.message : String(error)
			})
			.where(eq(post.id, created.id));
	}

	return { post: await requirePost(created.id), status: 'created' };
}

/** Re-runs the fetcher against a post whose earlier resolution failed. */
export async function retryResolution(postId: string): Promise<PostRecord> {
	const record = await requirePost(postId);
	if (!record.platformPostId || !record.permalink) {
		throw new Error('This post was composed by hand and has nothing to re-fetch.');
	}

	await database()
		.update(post)
		.set({ resolutionState: 'resolving', resolutionError: null })
		.where(eq(post.id, postId));

	try {
		const fetched = await fetchPost({
			platform: record.platform,
			platformPostId: record.platformPostId,
			permalink: record.permalink,
			authorHandle: record.authorHandle
		});
		await applyFetchedPost(postId, fetched);
	} catch (error) {
		await database()
			.update(post)
			.set({
				resolutionState: 'failed',
				resolutionError: error instanceof Error ? error.message : String(error)
			})
			.where(eq(post.id, postId));
	}

	return requirePost(postId);
}

/**
 * Writes a fetched post over its placeholder row and replaces its media rows.
 *
 * Existing media are dropped rather than reconciled: a re-fetch is a statement
 * that the provider's current answer supersedes what was stored.
 */
async function applyFetchedPost(postId: string, fetched: FetchedPost): Promise<void> {
	await database()
		.update(post)
		.set({
			permalink: fetched.permalink,
			authorName: fetched.authorName,
			authorHandle: fetched.authorHandle ? normaliseHandle(fetched.authorHandle) : null,
			authorProfileUrl: fetched.authorProfileUrl,
			authorVerified: fetched.authorVerified,
			body: fetched.body,
			language: fetched.language,
			postedAt: fetched.postedAt,
			likeCount: fetched.likeCount,
			repostCount: fetched.repostCount,
			replyCount: fetched.replyCount,
			rawPayload: fetched.raw,
			resolutionState: 'complete',
			resolutionError: null
		})
		.where(eq(post.id, postId));

	await discardMedia(postId);

	const rows: NewMedia[] = [];
	if (fetched.authorAvatarUrl) {
		rows.push({
			postId,
			role: 'avatar',
			kind: 'image',
			position: 0,
			sourceUrl: fetched.authorAvatarUrl
		});
	}
	fetched.media.forEach((asset, index) => {
		rows.push({
			postId,
			role: 'attachment',
			kind: asset.kind,
			position: index,
			sourceUrl: asset.sourceUrl,
			description: asset.description ?? null,
			width: asset.width ?? null,
			height: asset.height ?? null,
			durationMs: asset.durationMs ?? null
		});
	});

	await insertMedia(rows);
}

/** Saves a post the operator typed in. Manual posts skip resolution entirely. */
export async function createManualPost(input: ManualPostInput): Promise<PostRecord> {
	const [created] = await database()
		.insert(post)
		.values({
			platform: input.platform ?? 'manual',
			origin: 'manual',
			platformPostId: null,
			permalink: input.permalink?.trim() || null,
			authorName: input.authorName.trim(),
			authorHandle: input.authorHandle ? normaliseHandle(input.authorHandle) : null,
			authorVerified: input.authorVerified ?? false,
			body: input.body,
			postedAt: input.postedAt ?? new Date(),
			resolutionState: 'complete',
			reviewState: 'pending'
		})
		.returning({ id: post.id });

	const rows: NewMedia[] = [];
	if (input.avatarUrl?.trim()) {
		rows.push({
			postId: created.id,
			role: 'avatar',
			kind: 'image',
			position: 0,
			sourceUrl: input.avatarUrl.trim()
		});
	}
	(input.mediaUrls ?? [])
		.map((url) => url.trim())
		.filter(Boolean)
		.forEach((url, index) => {
			rows.push({
				postId: created.id,
				role: 'attachment',
				kind: inferMediaKind(url),
				position: index,
				sourceUrl: url
			});
		});

	await insertMedia(rows);

	return requirePost(created.id);
}

/**
 * Inserts media rows one statement apiece, in one batch.
 *
 * A single multi-row insert binds every column of every row, and a post with a
 * handful of attachments would pass D1's limit of 100 bound parameters.
 */
async function insertMedia(rows: NewMedia[]): Promise<void> {
	const [first, ...rest] = rows.map((row) => database().insert(media).values(row));
	if (first) await database().batch([first, ...rest]);
}

/**
 * Downloads every not-yet-cached asset belonging to a post.
 *
 * Failures are recorded on the row rather than thrown: one dead CDN link should
 * not stop the rest of a post's media from caching.
 */
export async function cacheMediaForPost(postId: string): Promise<void> {
	const pending = await database()
		.select()
		.from(media)
		.where(and(eq(media.postId, postId), inArray(media.cacheState, ['pending', 'failed'])));

	for (const asset of pending) {
		await database()
			.update(media)
			.set({ cacheState: 'downloading', cacheError: null })
			.where(eq(media.id, asset.id));

		try {
			const stored = await storeAsset(asset.id, asset.sourceUrl);
			await database()
				.update(media)
				.set({
					cacheState: 'cached',
					cachedPath: stored.key,
					byteLength: stored.byteLength,
					contentType: stored.contentType
				})
				.where(eq(media.id, asset.id));
		} catch (error) {
			await database()
				.update(media)
				.set({
					cacheState: 'failed',
					cacheError: error instanceof Error ? error.message : String(error)
				})
				.where(eq(media.id, asset.id));
		}
	}
}

/** Bytes held in media storage, as recorded on each cached asset. */
export async function storedByteLength(): Promise<number> {
	const [row] = await database()
		.select({ byteLength: sql<number>`coalesce(sum(${media.byteLength}), 0)` })
		.from(media)
		.where(eq(media.cacheState, 'cached'));
	return Number(row?.byteLength ?? 0);
}

/** Number of assets still waiting to be downloaded, across the whole library. */
export async function pendingMediaCount(): Promise<number> {
	const [row] = await database()
		.select({ count: sql<number>`count(*)` })
		.from(media)
		.where(inArray(media.cacheState, ['pending', 'downloading']));
	return Number(row?.count ?? 0);
}

/** Lists posts newest first, narrowed by {@link PostFilter}. */
export async function listPosts(filter: PostFilter = {}): Promise<PostRecord[]> {
	const conditions = [];

	if (filter.reviewState) {
		const states = Array.isArray(filter.reviewState) ? filter.reviewState : [filter.reviewState];
		conditions.push(inArray(post.reviewState, states));
	}
	if (filter.platform) conditions.push(eq(post.platform, filter.platform));
	if (filter.starred !== undefined) conditions.push(eq(post.starred, filter.starred));
	if (filter.search?.trim()) {
		const pattern = `%${filter.search.trim()}%`;
		conditions.push(
			or(like(post.body, pattern), like(post.authorName, pattern), like(post.authorHandle, pattern))
		);
	}

	const rows = await database()
		.select(postColumns)
		.from(post)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(post.createdAt))
		.limit(filter.limit ?? 200);

	return attachMediaToAll(rows);
}

/** Counts posts in each review state, for the queue badges. */
export async function countByReviewState(): Promise<Record<ReviewState, number>> {
	const rows = await database()
		.select({ reviewState: post.reviewState, count: sql<number>`count(*)` })
		.from(post)
		.groupBy(post.reviewState);

	const counts: Record<ReviewState, number> = {
		pending: 0,
		approved: 0,
		rejected: 0,
		archived: 0
	};
	for (const row of rows) counts[row.reviewState] = Number(row.count);
	return counts;
}

/** Records a moderation verdict. */
export async function setReviewState(
	postId: string,
	reviewState: ReviewState,
	reviewNote?: string | null
): Promise<void> {
	await database()
		.update(post)
		.set({ reviewState, reviewedAt: new Date(), reviewNote: reviewNote ?? null })
		.where(eq(post.id, postId));
}

/** Applies one verdict to several posts at once. */
export async function setReviewStateForAll(
	postIds: string[],
	reviewState: ReviewState
): Promise<void> {
	const [first, ...rest] = identifierBatches(postIds).map((batch) =>
		database()
			.update(post)
			.set({ reviewState, reviewedAt: new Date() })
			.where(inArray(post.id, batch))
	);
	if (first) await database().batch([first, ...rest]);
}

/** Toggles the operator's star flag, which is independent of review state. */
export async function setStarred(postId: string, starred: boolean): Promise<void> {
	await database().update(post).set({ starred }).where(eq(post.id, postId));
}

/**
 * Deletes a post and everything attached to it, stored media included.
 *
 * Rejecting is the normal way to take a post out of circulation; deleting is for
 * removing it from the record entirely, and forgets that the permalink was seen.
 */
export async function deletePost(postId: string): Promise<void> {
	await discardMedia(postId);
	await database().delete(post).where(eq(post.id, postId));
}

/** Loads one post, or throws when it is gone. */
export async function requirePost(postId: string): Promise<PostRecord> {
	const [record] = await findPosts([postId]);
	if (!record) throw new Error(`No post with id ${postId}.`);
	return record;
}

/**
 * Loads several posts with their media, in the order the identifiers were given.
 * Identifiers with no post are left out.
 */
export async function findPosts(postIds: string[]): Promise<PostRecord[]> {
	const rows: PostRow[] = [];
	for (const batch of identifierBatches([...new Set(postIds)])) {
		rows.push(...(await database().select(postColumns).from(post).where(inArray(post.id, batch))));
	}

	const records = new Map((await attachMediaToAll(rows)).map((record) => [record.id, record]));
	return postIds
		.map((postId) => records.get(postId))
		.filter((record): record is PostRecord => Boolean(record));
}

/** Removes a post's media rows and the objects they had stored. */
async function discardMedia(postId: string): Promise<void> {
	const existing = await database().select().from(media).where(eq(media.postId, postId));
	const keys = existing.map((asset) => asset.cachedPath).filter((key): key is string => !!key);
	// An object that is already gone is the outcome being asked for.
	await removeAssets(keys).catch(() => undefined);
	await database().delete(media).where(eq(media.postId, postId));
}

async function attachMedia(row: PostRow): Promise<PostRecord> {
	const [record] = await attachMediaToAll([row]);
	return record;
}

/**
 * Loads media for a set of posts and groups it in memory, rather than joining —
 * a join would fetch each post's columns once per attachment. The identifiers
 * are bound in batches to stay inside D1's parameter limit.
 */
async function attachMediaToAll(rows: PostRow[]): Promise<PostRecord[]> {
	if (rows.length === 0) return [];

	const assets: Media[] = [];
	for (const batch of identifierBatches(rows.map((row) => row.id))) {
		assets.push(
			...(await database()
				.select()
				.from(media)
				.where(inArray(media.postId, batch))
				.orderBy(media.position))
		);
	}

	const grouped = new Map<string, Media[]>();
	for (const asset of assets) {
		const bucket = grouped.get(asset.postId);
		if (bucket) bucket.push(asset);
		else grouped.set(asset.postId, [asset]);
	}

	return rows.map((row) => ({ ...row, media: grouped.get(row.id) ?? [] }));
}

/** Guesses whether a URL points at a still image, an animation or a video. */
function inferMediaKind(url: string): MediaKind {
	const path = url.split(/[?#]/)[0].toLowerCase();
	if (/\.(mp4|webm|mov|m4v)$/.test(path)) return 'video';
	if (/\.gif$/.test(path)) return 'animation';
	return 'image';
}
