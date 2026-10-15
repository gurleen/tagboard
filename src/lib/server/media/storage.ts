import type { R2Bucket } from '@cloudflare/workers-types';
import { bindings } from '$lib/server/environment';

/**
 * Media storage in R2.
 *
 * Social platforms serve avatars, photos and video from CDNs whose URLs expire
 * and whose latency is not acceptable on air. Every asset a post references is
 * therefore copied into the `MEDIA` bucket once, at ingestion, and the output
 * renders only from there, through `/media/[name]`.
 */

/** Refuse assets large enough to suggest a full-length video rather than a clip. */
const MAXIMUM_BYTE_LENGTH = 256 * 1024 * 1024;

/**
 * Ceiling for a response that does not declare its length.
 *
 * R2 accepts a stream only when its length is known in advance, so such a
 * response is read into memory first. A Worker has 128 MB in total, which this
 * leaves comfortable room under.
 */
const MAXIMUM_BUFFERED_BYTE_LENGTH = 64 * 1024 * 1024;

/** The Workers runtime's stream that announces its length to R2 ahead of the body. */
type FixedLengthStreamConstructor = new (length: number) => TransformStream<Uint8Array, Uint8Array>;

/** Where a downloaded asset landed. */
export type StoredAsset = {
	/** Object key in the bucket; this is what `media.cached_path` stores. */
	key: string;
	byteLength: number;
	contentType: string | null;
};

export class MediaDownloadError extends Error {
	constructor(readonly status: number) {
		super(`media download failed with status ${status}`);
		this.name = 'MediaDownloadError';
	}
}

/**
 * Downloads `sourceUrl` into the bucket under a key derived from `assetId`.
 *
 * `assetId` is the media row's primary key, which makes the key stable across
 * re-fetches and lets a deleted row's object be found without a reverse lookup on
 * the original URL.
 */
export async function storeAsset(assetId: string, sourceUrl: string): Promise<StoredAsset> {
	const response = await fetch(sourceUrl);
	if (!response.ok || !response.body) throw new MediaDownloadError(response.status);

	const contentType = response.headers.get('content-type')?.split(';')[0].trim() || null;
	const declaredLength = Number(response.headers.get('content-length') ?? Number.NaN);
	if (declaredLength > MAXIMUM_BYTE_LENGTH) {
		await response.body.cancel();
		throw new MediaDownloadError(413);
	}

	// A compressed response is decoded on arrival, so its declared length is not
	// the length of the bytes that reach the bucket.
	const lengthIsExact =
		Number.isInteger(declaredLength) && !response.headers.has('content-encoding');

	const key = `${assetId}.${inferExtension(contentType, sourceUrl)}`;
	const body = lengthIsExact ? streamOfLength(response.body, declaredLength) : null;

	// The panel is type-checked against the DOM's stream classes and the binding
	// against the Workers runtime's; they are the same objects at run time.
	const value = (body ?? (await readWithin(response.body))) as Parameters<R2Bucket['put']>[1];
	const stored = await bindings().MEDIA.put(key, value, {
		httpMetadata: contentType ? { contentType } : undefined
	});

	return { key, byteLength: stored.size, contentType };
}

/** Deletes cached objects. Absent keys are not an error; the caller's intent is that they be gone. */
export async function removeAssets(keys: string[]): Promise<void> {
	if (keys.length > 0) await bindings().MEDIA.delete(keys);
}

/**
 * Wraps a body whose length is declared so R2 can take it as a stream, without
 * holding the whole asset in memory.
 *
 * Returns `null` outside the Workers runtime — under `vite dev`, where the
 * bucket is reached through Wrangler's proxy — and the body is buffered instead.
 */
function streamOfLength(
	body: ReadableStream<Uint8Array>,
	length: number
): ReadableStream<Uint8Array> | null {
	const FixedLengthStream = (globalThis as { FixedLengthStream?: FixedLengthStreamConstructor })
		.FixedLengthStream;
	if (!FixedLengthStream) return null;

	const { readable, writable } = new FixedLengthStream(length);
	void body.pipeTo(writable).catch(() => undefined);
	return readable;
}

/** Reads a body of undeclared length into memory, refusing one that outgrows the ceiling. */
async function readWithin(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	let byteLength = 0;

	for await (const chunk of body) {
		byteLength += chunk.byteLength;
		if (byteLength > MAXIMUM_BUFFERED_BYTE_LENGTH) {
			await body.cancel().catch(() => undefined);
			throw new MediaDownloadError(413);
		}
		chunks.push(chunk);
	}

	const joined = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return joined;
}

const EXTENSIONS_BY_CONTENT_TYPE: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'video/quicktime': 'mov'
};

/**
 * Picks a file extension from the response content type, falling back to the
 * extension in the URL path and finally to a neutral `bin`.
 */
function inferExtension(contentType: string | null, url: string): string {
	const fromContentType = contentType ? EXTENSIONS_BY_CONTENT_TYPE[contentType] : undefined;
	if (fromContentType) return fromContentType;

	const path = url.split(/[?#]/)[0];
	const extension = /\.([A-Za-z0-9]{1,5})$/.exec(path)?.[1];
	return extension?.toLowerCase() ?? 'bin';
}
