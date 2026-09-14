import type { Platform } from '$lib/database/schema';

/**
 * A post identified by its permalink, before anything is known about its content.
 *
 * This is what the paste field produces and what a fetcher consumes.
 */
export type PostReference = {
	platform: Platform;
	/** Native identifier: a numeric status id on X, a shortcode on Instagram. */
	platformPostId: string;
	/** Normalised permalink — tracking parameters and media suffixes removed. */
	permalink: string;
	/** Handle taken from the URL path, when the platform puts one there. */
	authorHandle: string | null;
};

export class UnrecognisedPermalinkError extends Error {
	constructor(readonly input: string) {
		super(`"${input}" is not a recognised X or Instagram post link.`);
		this.name = 'UnrecognisedPermalinkError';
	}
}

const X_HOSTS = new Set([
	'x.com',
	'www.x.com',
	'twitter.com',
	'www.twitter.com',
	'mobile.twitter.com'
]);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);

/** Instagram path segments that introduce a post shortcode. */
const INSTAGRAM_POST_SEGMENTS = new Set(['p', 'reel', 'reels', 'tv']);

/**
 * Turns a pasted link into a {@link PostReference}.
 *
 * Accepts the forms an operator actually pastes: share links with tracking
 * parameters, links to a specific photo within a thread, `twitter.com` aliases
 * of `x.com`, and profile-prefixed Instagram paths.
 *
 * @throws {UnrecognisedPermalinkError} when the link is not a post on a supported platform.
 */
export function parsePermalink(input: string): PostReference {
	const trimmed = input.trim();
	if (!trimmed) throw new UnrecognisedPermalinkError(input);

	let url: URL;
	try {
		url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
	} catch {
		throw new UnrecognisedPermalinkError(input);
	}

	const host = url.hostname.toLowerCase();
	const segments = url.pathname.split('/').filter(Boolean);

	if (X_HOSTS.has(host)) {
		// /{handle}/status/{id} — a trailing /photo/1 or /video/1 may follow.
		const statusIndex = segments.findIndex(
			(segment) => segment === 'status' || segment === 'statuses'
		);
		const platformPostId = statusIndex >= 0 ? segments[statusIndex + 1] : undefined;
		if (!platformPostId || !/^\d+$/.test(platformPostId)) {
			throw new UnrecognisedPermalinkError(input);
		}

		const authorHandle = statusIndex > 0 ? segments[statusIndex - 1] : null;
		return {
			platform: 'x',
			platformPostId,
			permalink: `https://x.com/${authorHandle ?? 'i'}/status/${platformPostId}`,
			authorHandle: authorHandle ? normaliseHandle(authorHandle) : null
		};
	}

	if (INSTAGRAM_HOSTS.has(host)) {
		const postIndex = segments.findIndex((segment) => INSTAGRAM_POST_SEGMENTS.has(segment));
		const platformPostId = postIndex >= 0 ? segments[postIndex + 1] : undefined;
		if (!platformPostId || !/^[A-Za-z0-9_-]+$/.test(platformPostId)) {
			throw new UnrecognisedPermalinkError(input);
		}

		// A profile-prefixed path (/{handle}/p/{shortcode}) names the author; the
		// bare /p/{shortcode} form does not.
		const authorHandle = postIndex > 0 ? segments[postIndex - 1] : null;
		const segment = segments[postIndex] === 'reels' ? 'reel' : segments[postIndex];
		return {
			platform: 'instagram',
			platformPostId,
			permalink: `https://www.instagram.com/${segment}/${platformPostId}/`,
			authorHandle: authorHandle ? normaliseHandle(authorHandle) : null
		};
	}

	throw new UnrecognisedPermalinkError(input);
}

/** True when {@link parsePermalink} would succeed, for live field validation. */
export function isSupportedPermalink(input: string): boolean {
	try {
		parsePermalink(input);
		return true;
	} catch {
		return false;
	}
}

/** Strips a leading `@` and lowercases, so handles compare and store uniformly. */
export function normaliseHandle(handle: string): string {
	return handle.replace(/^@+/, '').toLowerCase();
}

/** Renders a handle for display, with the `@` platform convention restored. */
export function formatHandle(handle: string | null | undefined): string {
	return handle ? `@${normaliseHandle(handle)}` : '';
}
