import type { MediaKind, Platform } from '$lib/database/schema';
import { FetcherNotConfiguredError, FetcherUnavailableError } from './errors';
import type { PostReference } from './permalink';
import { instagramEmbedFetcher } from './instagram-embed';
import { xSyndicationFetcher } from './x-syndication';

/**
 * One image or video belonging to a fetched post, still at its origin URL. The
 * media cache downloads these after the post row is written.
 */
export type FetchedMedia = {
	kind: MediaKind;
	sourceUrl: string;
	description?: string | null;
	width?: number | null;
	height?: number | null;
	durationMs?: number | null;
};

/**
 * A post as a platform reports it: the shape every fetcher must produce, and the
 * only shape the ingestion pipeline knows how to persist.
 */
export type FetchedPost = {
	platform: Platform;
	platformPostId: string;
	permalink: string;

	authorName: string;
	authorHandle: string | null;
	authorProfileUrl: string | null;
	authorAvatarUrl: string | null;
	authorVerified: boolean;

	body: string;
	language: string | null;
	postedAt: Date | null;

	likeCount: number | null;
	repostCount: number | null;
	replyCount: number | null;

	media: FetchedMedia[];
	/** The provider's untouched response, stored so later columns can be backfilled. */
	raw: Record<string, unknown>;
};

/**
 * Retrieves posts from one platform.
 *
 * Implementations are registered in {@link fetchers}; the pipeline picks one by
 * platform and never branches on platform itself.
 */
export interface PostFetcher {
	readonly platform: Platform;
	/** Human-readable name of the provider, shown in settings and error messages. */
	readonly providerName: string;
	/** False until credentials or an endpoint are configured for this fetcher. */
	isConfigured(): boolean;
	fetch(reference: PostReference): Promise<FetchedPost>;
}

/** Fetcher per platform. `manual` has none: those posts are typed by the operator. */
const fetchers: Partial<Record<Platform, PostFetcher>> = {
	x: xSyndicationFetcher,
	instagram: instagramEmbedFetcher
};

/** Returns the fetcher for a platform, or `undefined` when none is registered. */
export function fetcherFor(platform: Platform): PostFetcher | undefined {
	return fetchers[platform];
}

/** Every registered fetcher, for the provider readout in settings. */
export function registeredFetchers(): PostFetcher[] {
	return Object.values(fetchers).filter((fetcher): fetcher is PostFetcher => Boolean(fetcher));
}

/**
 * Retrieves the post a reference points at.
 *
 * @throws {FetcherUnavailableError} when the platform has no fetcher.
 * @throws {FetcherNotConfiguredError} when the fetcher exists but its provider is not available.
 */
export async function fetchPost(reference: PostReference): Promise<FetchedPost> {
	const fetcher = fetcherFor(reference.platform);
	if (!fetcher) throw new FetcherUnavailableError(reference.platform);
	if (!fetcher.isConfigured()) {
		throw new FetcherNotConfiguredError(fetcher.platform, fetcher.providerName);
	}
	return fetcher.fetch(reference);
}
