import type { Media } from '$lib/database/schema';

/**
 * Where a cached asset is served from, or `null` when it has not been cached.
 *
 * Nothing renders from `sourceUrl`: CDN links expire and their latency is not
 * acceptable on air. `/media/[name]` streams the stored copy out of R2.
 */
export function assetUrl(asset: Media | undefined): string | null {
	if (!asset || asset.cacheState !== 'cached' || !asset.cachedPath) return null;
	return `/media/${encodeURIComponent(asset.cachedPath)}`;
}

/** Formats a byte count for display, in the largest unit that keeps it readable. */
export function formatByteLength(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Whether a cached asset is drawn with `<video>` rather than `<img>`.
 *
 * Decided by what was stored, not by `kind`: X's `animation` is a looping mp4,
 * while an operator's `.gif` URL is also an `animation` and is an image.
 */
export function playsAsVideo(asset: Media): boolean {
	return asset.contentType ? asset.contentType.startsWith('video/') : asset.kind === 'video';
}
