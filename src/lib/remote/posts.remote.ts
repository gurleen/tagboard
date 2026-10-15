import * as v from 'valibot';
import { command } from '$app/server';
import { PLATFORMS, REVIEW_STATES } from '$lib/database/schema';
import * as posts from '$lib/server/repository/posts';

/**
 * The control panel's access to the post repository.
 *
 * One command per repository function and no logic of their own: each validates
 * what crossed the network and hands it on. Reads are commands too, not
 * queries — see the note on remote functions in `docs/architecture.md`.
 */

const identifier = v.pipe(v.string(), v.uuid());
const reviewState = v.picklist(REVIEW_STATES);

export const listPosts = command(
	v.object({
		reviewState: v.optional(v.union([reviewState, v.array(reviewState)])),
		platform: v.optional(v.picklist(PLATFORMS)),
		starred: v.optional(v.boolean()),
		search: v.optional(v.string()),
		limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)))
	}),
	(filter) => posts.listPosts(filter)
);

export const countByReviewState = command(() => posts.countByReviewState());

export const pendingMediaCount = command(() => posts.pendingMediaCount());

export const ingestPermalink = command(v.string(), (link) => posts.ingestPermalink(link));

export const createManualPost = command(
	v.object({
		authorName: v.pipe(v.string(), v.trim(), v.nonEmpty()),
		authorHandle: v.nullish(v.string()),
		body: v.pipe(v.string(), v.nonEmpty()),
		platform: v.optional(v.picklist(PLATFORMS)),
		permalink: v.nullish(v.string()),
		postedAt: v.nullish(v.date()),
		authorVerified: v.optional(v.boolean()),
		mediaUrls: v.optional(v.array(v.string())),
		avatarUrl: v.nullish(v.string())
	}),
	(input) => posts.createManualPost(input)
);

export const cacheMediaForPost = command(identifier, (postId) => posts.cacheMediaForPost(postId));

export const retryResolution = command(identifier, (postId) => posts.retryResolution(postId));

export const setReviewState = command(
	v.object({ postId: identifier, reviewState, reviewNote: v.nullish(v.string()) }),
	({ postId, reviewState, reviewNote }) => posts.setReviewState(postId, reviewState, reviewNote)
);

export const setReviewStateForAll = command(
	v.object({ postIds: v.array(identifier), reviewState }),
	({ postIds, reviewState }) => posts.setReviewStateForAll(postIds, reviewState)
);

export const setStarred = command(
	v.object({ postId: identifier, starred: v.boolean() }),
	({ postId, starred }) => posts.setStarred(postId, starred)
);

export const deletePost = command(identifier, (postId) => posts.deletePost(postId));
