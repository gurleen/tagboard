import { invoke, isTauri } from '@tauri-apps/api/core';
import type { MediaKind } from '$lib/database/schema';
import { PostUnavailableError } from './errors';
import type { FetchedMedia, FetchedPost, PostFetcher } from './fetcher';
import type { PostReference } from './permalink';

/**
 * X retrieval through the syndication endpoint that backs the embed widget.
 *
 * `cdn.syndication.twimg.com/tweet-result` returns the post as fields rather
 * than as markup, needs no credentials and has no post cap, which is what makes
 * it preferable to both the paid X API tier and to scraping an embed. It is
 * undocumented, so X may change or withdraw it without notice; the
 * {@link PostFetcher} interface confines that risk to this file.
 *
 * The request itself is issued in Rust. The endpoint's
 * `Access-Control-Allow-Origin` names `https://platform.twitter.com` alone, so
 * the web view cannot call it directly.
 */

/** Shape of the fields this fetcher reads out of the syndication payload. */
type SyndicationResponse = {
	__typename?: string;
	id_str?: string;
	text?: string;
	lang?: string | null;
	created_at?: string;
	favorite_count?: number;
	conversation_count?: number;
	user?: {
		name?: string;
		screen_name?: string;
		profile_image_url_https?: string;
		is_blue_verified?: boolean;
		verified?: boolean;
	};
	entities?: {
		media?: { url?: string }[];
		urls?: { url?: string; expanded_url?: string }[];
	};
	mediaDetails?: SyndicationMedia[];
	tombstone?: { text?: { text?: string } };
};

type SyndicationMedia = {
	type?: string;
	media_url_https?: string;
	ext_alt_text?: string;
	original_info?: { width?: number; height?: number };
	video_info?: {
		duration_millis?: number;
		variants?: { bitrate?: number; content_type?: string; url?: string }[];
	};
};

/**
 * Avatars are served at 48px under the `_normal` suffix, which is too small for
 * a board rendered at broadcast resolution. `_400x400` is the largest square
 * variant X publishes for every account.
 */
const AVATAR_SUFFIX = /_normal(\.[a-z]+)$/;

/** Photo variant requested from the image CDN: the largest X serves by default. */
const PHOTO_VARIANT = '?format=jpg&name=large';

class XSyndicationFetcher implements PostFetcher {
	readonly platform = 'x' as const;
	readonly providerName = 'X syndication';

	/**
	 * The endpoint needs no credentials, so the only precondition is the Rust
	 * side that issues the request.
	 */
	isConfigured(): boolean {
		return isTauri();
	}

	async fetch(reference: PostReference): Promise<FetchedPost> {
		const payload = await invoke<SyndicationResponse>('syndication_fetch_post', {
			postId: reference.platformPostId
		});

		// Deleted, protected and suspended-account posts answer 200 with a
		// tombstone rather than an error status.
		if (payload.__typename !== 'Tweet') {
			throw new PostUnavailableError(
				payload.tombstone?.text?.text?.trim() ||
					'X did not return this post. It may be deleted, protected, or from a suspended account.'
			);
		}

		const handle = payload.user?.screen_name ?? reference.authorHandle;
		const postedAt = payload.created_at ? new Date(payload.created_at) : null;

		return {
			platform: 'x',
			platformPostId: payload.id_str ?? reference.platformPostId,
			permalink: handle
				? `https://x.com/${handle}/status/${payload.id_str ?? reference.platformPostId}`
				: reference.permalink,

			authorName: payload.user?.name?.trim() || (handle ? `@${handle}` : 'Unknown author'),
			authorHandle: handle ?? null,
			authorProfileUrl: handle ? `https://x.com/${handle}` : null,
			authorAvatarUrl: fullSizeAvatar(payload.user?.profile_image_url_https),
			authorVerified: Boolean(payload.user?.is_blue_verified || payload.user?.verified),

			body: readBody(payload),
			language: payload.lang ?? null,
			postedAt: postedAt && !Number.isNaN(postedAt.valueOf()) ? postedAt : null,

			likeCount: payload.favorite_count ?? null,
			// The endpoint reports no repost count at all, and reports replies only
			// as the size of the whole conversation, which counts nested replies
			// the platform's own reply figure excludes.
			repostCount: null,
			replyCount: payload.conversation_count ?? null,

			media: readMedia(payload.mediaDetails),
			raw: payload as unknown as Record<string, unknown>
		};
	}
}

/**
 * Assembles the display text: t.co links restored to what they point at, and
 * the trailing t.co link that stands in for attached media removed, since the
 * media is rendered from {@link FetchedPost.media} instead.
 */
function readBody(payload: SyndicationResponse): string {
	let body = payload.text ?? '';

	for (const link of payload.entities?.urls ?? []) {
		if (link.url && link.expanded_url) body = body.replaceAll(link.url, link.expanded_url);
	}
	for (const attachment of payload.entities?.media ?? []) {
		if (attachment.url) body = body.replaceAll(attachment.url, '');
	}

	return body.trim();
}

/** Rewrites an avatar URL to the largest square variant X publishes. */
function fullSizeAvatar(url: string | undefined): string | null {
	if (!url) return null;
	return url.replace(AVATAR_SUFFIX, '_400x400$1');
}

/** Maps the payload's media entries onto the ingestion pipeline's own shape. */
function readMedia(details: SyndicationMedia[] | undefined): FetchedMedia[] {
	const assets: FetchedMedia[] = [];

	for (const detail of details ?? []) {
		const kind = mediaKind(detail.type);
		if (!kind) continue;

		const sourceUrl =
			kind === 'image' ? photoUrl(detail.media_url_https) : bestProgressiveVariant(detail);
		if (!sourceUrl) continue;

		assets.push({
			kind,
			sourceUrl,
			description: detail.ext_alt_text ?? null,
			width: detail.original_info?.width ?? null,
			height: detail.original_info?.height ?? null,
			durationMs: detail.video_info?.duration_millis ?? null
		});
	}

	return assets;
}

/** `animated_gif` is the platform's own term for a looping, silent mp4. */
function mediaKind(type: string | undefined): MediaKind | null {
	if (type === 'photo') return 'image';
	if (type === 'animated_gif') return 'animation';
	if (type === 'video') return 'video';
	return null;
}

function photoUrl(url: string | undefined): string | null {
	return url ? `${url}${PHOTO_VARIANT}` : null;
}

/**
 * Picks the highest-bitrate mp4 among a video's variants.
 *
 * The list also carries an HLS playlist, which is skipped: the media cache
 * stores one file per asset and cannot follow a manifest's segments.
 */
function bestProgressiveVariant(detail: SyndicationMedia): string | null {
	let best: { bitrate: number; url: string } | null = null;

	for (const variant of detail.video_info?.variants ?? []) {
		if (variant.content_type !== 'video/mp4' || !variant.url) continue;
		const bitrate = variant.bitrate ?? 0;
		if (!best || bitrate > best.bitrate) best = { bitrate, url: variant.url };
	}

	return best?.url ?? null;
}

export const xSyndicationFetcher = new XSyndicationFetcher();
