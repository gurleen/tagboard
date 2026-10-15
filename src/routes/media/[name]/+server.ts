import { error } from '@sveltejs/kit';
import type { R2Range } from '@cloudflare/workers-types';
import { bindings } from '$lib/server/environment';
import type { RequestHandler } from './$types';

/**
 * Serves a cached asset out of R2.
 *
 * This route sits outside Cloudflare Access alongside `/output`, because OBS
 * loads the images and video a board shows. The assets are copies of public
 * posts, addressed by an unguessable media row identifier.
 *
 * Byte ranges are honoured: a `<video>` element asks for one before it will play
 * or loop a clip.
 */

/** `{media id}.{extension}`, which is the only shape `storeAsset` writes. */
const ASSET_NAME = /^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

/** A cached asset never changes under its name; a re-fetch writes a new media row. */
const CACHE_CONTROL = 'public, max-age=86400';

export const GET: RequestHandler = async ({ params, request }) => {
	if (!ASSET_NAME.test(params.name)) error(404, 'Not found');
	const bucket = bindings().MEDIA;

	const requestedRange = parseRange(request.headers.get('range'));
	const object = await bucket
		.get(params.name, requestedRange ? { range: requestedRange } : {})
		.catch(async () => {
			// R2 rejects a range that starts past the end of the object.
			const stored = await bucket.head(params.name);
			if (!stored) error(404, 'Not found');
			return new Response(null, {
				status: 416,
				headers: { 'content-range': `bytes */${stored.size}` }
			});
		});
	if (!object) error(404, 'Not found');
	if (object instanceof Response) return object;

	const headers = new Headers({
		'accept-ranges': 'bytes',
		'cache-control': CACHE_CONTROL,
		etag: object.httpEtag
	});
	if (object.httpMetadata?.contentType) {
		headers.set('content-type', object.httpMetadata.contentType);
	}

	const body = object.body as unknown as ReadableStream;

	if (!requestedRange) {
		headers.set('content-length', String(object.size));
		return new Response(body, { headers });
	}

	const { offset, length } = resolveRange(requestedRange, object.size);
	headers.set('content-length', String(length));
	headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
	return new Response(body, { status: 206, headers });
};

/**
 * Reads a single `bytes=` range. Multiple ranges are not supported and are
 * treated as a request for the whole object, which the specification permits.
 */
function parseRange(header: string | null): R2Range | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
	if (!match) return null;

	const [, start, end] = match;
	if (start && end) {
		const offset = Number(start);
		const last = Number(end);
		return last >= offset ? { offset, length: last - offset + 1 } : null;
	}
	if (start) return { offset: Number(start) };
	if (end) return { suffix: Number(end) };
	return null;
}

/** The range R2 actually returned, as an offset and length within the object. */
function resolveRange(range: R2Range, size: number): { offset: number; length: number } {
	if ('suffix' in range) {
		const length = Math.min(range.suffix, size);
		return { offset: size - length, length };
	}
	const offset = range.offset ?? 0;
	const length = Math.min(range.length ?? size - offset, size - offset);
	return { offset, length };
}
