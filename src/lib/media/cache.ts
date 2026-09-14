import { convertFileSrc, invoke } from '@tauri-apps/api/core';

/**
 * Where a downloaded asset landed, as reported by `media_cache_store`.
 */
export type CachedAsset = {
	/** Absolute path on disk. */
	path: string;
	/** Path relative to the cache directory; this is what `media.cached_path` stores. */
	relativePath: string;
	byteLength: number;
	contentType: string | null;
};

/**
 * Downloads an asset into the local cache under the media row's own identifier.
 *
 * Passing the row id keeps the filename stable across re-fetches and lets a
 * deleted row's file be located without a reverse lookup on the source URL.
 */
export function storeAsset(assetId: string, url: string): Promise<CachedAsset> {
	return invoke<CachedAsset>('media_cache_store', { assetId, url });
}

/**
 * Resolves a stored relative path to an absolute one, or `null` when the file is
 * missing — a cache cleared out from under the database, for instance.
 */
export function resolveAsset(relativePath: string): Promise<string | null> {
	return invoke<string | null>('media_cache_resolve', { relativePath });
}

/** Deletes one cached asset. Removing an absent file is not an error. */
export function removeAsset(relativePath: string): Promise<void> {
	return invoke('media_cache_remove', { relativePath });
}

/** Total bytes held by the cache, for the storage readout in settings. */
export function cacheByteLength(): Promise<number> {
	return invoke<number>('media_cache_byte_length');
}

/**
 * Turns an absolute cache path into a URL the web view can load.
 *
 * Tauri's asset protocol is scoped to the cache directory in `tauri.conf.json`;
 * paths outside it will not load, by design.
 */
export function assetUrl(absolutePath: string): string {
	return convertFileSrc(absolutePath);
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
