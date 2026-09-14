import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * Columns every table carries. Timestamps are stored as millisecond epoch
 * integers, which SQLite orders correctly and Drizzle hands back as `Date`.
 */
const identifier = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date());

const updatedAt = () =>
	integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
		.$onUpdateFn(() => new Date());

/** Networks a post can come from. `manual` covers operator-composed content. */
export const PLATFORMS = ['x', 'instagram', 'manual'] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * How a post entered the system.
 *
 * `search` is reserved for the saved-search fetcher that is not built yet; no
 * code produces it today, but the value exists so adding the feature does not
 * require a migration of the enum.
 */
export const POST_ORIGINS = ['url', 'manual', 'search'] as const;
export type PostOrigin = (typeof POST_ORIGINS)[number];

/**
 * Progress of the resolver that turns a pasted permalink into a full post.
 * Operator-composed posts are `complete` from the moment they are saved.
 */
export const RESOLUTION_STATES = ['pending', 'resolving', 'complete', 'failed'] as const;
export type ResolutionState = (typeof RESOLUTION_STATES)[number];

/** Moderation verdict. Only `approved` posts are eligible for a board. */
export const REVIEW_STATES = ['pending', 'approved', 'rejected', 'archived'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/**
 * A single piece of social content, from pasted permalink or operator entry.
 *
 * Rows are never deleted as part of the moderation flow — a rejected post stays
 * so the same permalink pasted twice is recognised rather than re-reviewed.
 */
export const post = sqliteTable(
	'post',
	{
		id: identifier(),

		platform: text('platform', { enum: PLATFORMS }).notNull(),
		origin: text('origin', { enum: POST_ORIGINS }).notNull(),

		/** Native identifier on the platform. Absent for operator-composed posts. */
		platformPostId: text('platform_post_id'),
		/** Canonical URL of the post, as pasted or as reported by the fetcher. */
		permalink: text('permalink'),

		authorName: text('author_name').notNull(),
		authorHandle: text('author_handle'),
		authorProfileUrl: text('author_profile_url'),
		authorVerified: integer('author_verified', { mode: 'boolean' }).notNull().default(false),

		body: text('body').notNull().default(''),
		language: text('language'),
		/** When the post was published on the platform, not when it was ingested. */
		postedAt: integer('posted_at', { mode: 'timestamp_ms' }),

		likeCount: integer('like_count'),
		repostCount: integer('repost_count'),
		replyCount: integer('reply_count'),

		resolutionState: text('resolution_state', { enum: RESOLUTION_STATES })
			.notNull()
			.default('pending'),
		/** Message from the last failed resolution attempt, for the operator to read. */
		resolutionError: text('resolution_error'),
		/** Verbatim fetcher response, kept so a schema change can backfill from it. */
		rawPayload: text('raw_payload', { mode: 'json' }).$type<Record<string, unknown>>(),

		reviewState: text('review_state', { enum: REVIEW_STATES }).notNull().default('pending'),
		reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
		reviewNote: text('review_note'),

		/** Operator flag marking a post worth returning to; independent of review. */
		starred: integer('starred', { mode: 'boolean' }).notNull().default(false),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		// A permalink pasted twice must land on the existing row rather than a
		// duplicate. Operator-composed posts have no platform id, and SQLite
		// treats each NULL as distinct, so they are exempt from this constraint.
		unique('post_platform_identity').on(table.platform, table.platformPostId),
		index('post_review_state_index').on(table.reviewState, table.createdAt),
		index('post_platform_index').on(table.platform),
		index('post_resolution_state_index').on(table.resolutionState)
	]
);

/** What an asset is used for within its post. */
export const MEDIA_ROLES = ['avatar', 'attachment'] as const;
export type MediaRole = (typeof MEDIA_ROLES)[number];

export const MEDIA_KINDS = ['image', 'animation', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Progress of the local download for one asset. */
export const CACHE_STATES = ['pending', 'downloading', 'cached', 'failed'] as const;
export type CacheState = (typeof CACHE_STATES)[number];

/**
 * An image or video belonging to a post, mirrored into the local media cache.
 *
 * `cachedPath` is relative to the cache directory the Rust side owns; it is
 * resolved to an absolute path and passed through Tauri's asset protocol at
 * render time. Nothing on the board window loads from `sourceUrl` — CDN links
 * expire and their latency is not acceptable on air.
 */
export const media = sqliteTable(
	'media',
	{
		id: identifier(),
		postId: text('post_id')
			.notNull()
			.references(() => post.id, { onDelete: 'cascade' }),

		role: text('role', { enum: MEDIA_ROLES }).notNull().default('attachment'),
		kind: text('kind', { enum: MEDIA_KINDS }).notNull().default('image'),
		/** Display order among a post's attachments, ascending. */
		position: integer('position').notNull().default(0),

		sourceUrl: text('source_url').notNull(),
		cachedPath: text('cached_path'),
		cacheState: text('cache_state', { enum: CACHE_STATES }).notNull().default('pending'),
		cacheError: text('cache_error'),

		byteLength: integer('byte_length'),
		contentType: text('content_type'),
		width: integer('width'),
		height: integer('height'),
		durationMs: integer('duration_ms'),
		/** Alternative text carried through from the platform, for accessibility. */
		description: text('description'),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		index('media_post_index').on(table.postId, table.role, table.position),
		index('media_cache_state_index').on(table.cacheState)
	]
);

/** Arrangement the board window renders. */
export const BOARD_LAYOUTS = ['grid', 'carousel', 'single'] as const;
export type BoardLayout = (typeof BOARD_LAYOUTS)[number];

/** Animation between one page of posts and the next. */
export const BOARD_TRANSITIONS = ['fade', 'slide', 'none'] as const;
export type BoardTransition = (typeof BOARD_TRANSITIONS)[number];

/** Visual settings for a board, stored as one JSON column rather than a wide row. */
export type BoardTheme = {
	backgroundColor: string;
	surfaceColor: string;
	textColor: string;
	accentColor: string;
	fontFamily: string;
	/** Multiplier applied to every type size, for tuning legibility at distance. */
	textScale: number;
	cornerRadiusPx: number;
	/** Optional full-bleed background image, as a media cache relative path. */
	backgroundImagePath?: string;
};

export const DEFAULT_BOARD_THEME: BoardTheme = {
	backgroundColor: '#0b0f14',
	surfaceColor: '#161c24',
	textColor: '#f6f7f9',
	accentColor: '#4c90f0',
	fontFamily: 'IBM Plex Sans Variable',
	textScale: 1,
	cornerRadiusPx: 8
};

/**
 * A configured video board output: its grid shape, rotation timing and styling.
 *
 * Several boards may exist so the operator can prepare a look for a later segment
 * while another is on air; exactly one row carries `isLive`.
 */
export const board = sqliteTable(
	'board',
	{
		id: identifier(),
		name: text('name').notNull(),
		description: text('description'),

		layout: text('layout', { enum: BOARD_LAYOUTS }).notNull().default('grid'),
		columnCount: integer('column_count').notNull().default(3),
		rowCount: integer('row_count').notNull().default(2),

		/** Dwell time per page of posts before the grid advances. */
		rotationIntervalMs: integer('rotation_interval_ms').notNull().default(8000),
		transition: text('transition', { enum: BOARD_TRANSITIONS }).notNull().default('fade'),
		transitionDurationMs: integer('transition_duration_ms').notNull().default(600),

		showMetrics: integer('show_metrics', { mode: 'boolean' }).notNull().default(false),
		showTimestamp: integer('show_timestamp', { mode: 'boolean' }).notNull().default(true),
		showPlatformBadge: integer('show_platform_badge', { mode: 'boolean' }).notNull().default(true),

		theme: text('theme', { mode: 'json' })
			.$type<BoardTheme>()
			.notNull()
			.$defaultFn(() => DEFAULT_BOARD_THEME),

		/** True on the one board the board window is currently rendering. */
		isLive: integer('is_live', { mode: 'boolean' }).notNull().default(false),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [index('board_is_live_index').on(table.isLive)]
);

/**
 * An approved post placed on a board, in the operator's chosen order.
 *
 * Membership is explicit rather than derived from the review queue so that
 * approving a post does not change what is on air without the operator saying so.
 */
export const boardEntry = sqliteTable(
	'board_entry',
	{
		id: identifier(),
		boardId: text('board_id')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),
		postId: text('post_id')
			.notNull()
			.references(() => post.id, { onDelete: 'cascade' }),

		/** Sort key within the board, ascending. Gaps are expected after reordering. */
		position: integer('position').notNull().default(0),
		/** Pinned entries hold a cell instead of rotating out. */
		pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),

		/** Last time the board window displayed this entry, for rotation fairness. */
		lastAiredAt: integer('last_aired_at', { mode: 'timestamp_ms' }),
		airCount: integer('air_count').notNull().default(0),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		unique('board_entry_membership').on(table.boardId, table.postId),
		index('board_entry_order_index').on(table.boardId, table.position)
	]
);

/**
 * Application settings that are not per-board: window placement, cache limits,
 * credentials for whichever fetcher is eventually wired up.
 */
export const setting = sqliteTable('setting', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).$type<unknown>(),
	updatedAt: updatedAt()
});

export const postRelations = relations(post, ({ many }) => ({
	media: many(media),
	boardEntries: many(boardEntry)
}));

export const mediaRelations = relations(media, ({ one }) => ({
	post: one(post, { fields: [media.postId], references: [post.id] })
}));

export const boardRelations = relations(board, ({ many }) => ({
	entries: many(boardEntry)
}));

export const boardEntryRelations = relations(boardEntry, ({ one }) => ({
	board: one(board, { fields: [boardEntry.boardId], references: [board.id] }),
	post: one(post, { fields: [boardEntry.postId], references: [post.id] })
}));

/** Convenience alias used when seeding `updated_at` from raw SQL. */
export const now = sql`(unixepoch() * 1000)`;

export type Post = typeof post.$inferSelect;
export type NewPost = typeof post.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type Board = typeof board.$inferSelect;
export type NewBoard = typeof board.$inferInsert;
export type BoardEntry = typeof boardEntry.$inferSelect;
export type NewBoardEntry = typeof boardEntry.$inferInsert;
export type Setting = typeof setting.$inferSelect;
