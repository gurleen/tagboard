import { invoke, isTauri } from '@tauri-apps/api/core';
import { PostUnavailableError } from './errors';
import type { FetchedMedia, FetchedPost, PostFetcher } from './fetcher';
import type { PostReference } from './permalink';

/**
 * Instagram retrieval through the document that backs the official post embed.
 *
 * `instagram.com/p/{shortcode}/embed/captioned/` needs no credentials, no
 * reviewed Meta application and no per-post fee, which is what makes it
 * preferable to the three paths weighed against it: oEmbed, which now demands an
 * app token; the Graph API, whose Basic Display tier reaches only accounts that
 * authorise the application; and a third-party aggregator, which bills per post.
 * It is undocumented, so Instagram may change or withdraw it without notice; the
 * {@link PostFetcher} interface confines that risk to this file.
 *
 * The request is issued in Rust. Instagram serves the post itself only to a
 * request carrying `Sec-Fetch-Mode: navigate`, and a web view writes its own
 * `Sec-` headers and refuses to let script set them; embedding the endpoint in a
 * frame instead would satisfy the header but leave the document cross-origin and
 * so unreadable to script, exactly as it would on X.
 *
 * What the document does **not** carry, in each case stored as `null`:
 *
 * - **`postedAt`** — the embed prints no date at all.
 * - **`repostCount`**, **`replyCount`** — neither figure is rendered.
 * - **`language`** — never declared.
 * - **`authorVerified`** — the embed omits the badge, so no post resolves as
 *   verified; the operator can still set it by hand.
 *
 * Two further limits are worth stating plainly:
 *
 * - **Video is a still.** A reel or in-feed video yields only its cover frame,
 *   which is a JPEG. It is recorded as an `image`, because that is what the file
 *   is, and a board that was handed `video` would render a `<video>` element
 *   over a photograph.
 * - **A carousel is its first frame.** The embed renders one item of a sidecar.
 */

/** The `data-media-type` values Instagram renders onto the embed root. */
const SIDECAR_MEDIA_TYPE = 'GraphSidecar';

/** `409,463 likes`, as the embed prints it under English grouping. */
const LIKE_COUNT = /^([\d,]+)\s+likes?$/;

/** `padding-bottom: 125%` on the media frame: the post's height over its width. */
const ASPECT_RATIO = /padding-bottom:\s*([\d.]+)%/;

/** One `srcset` candidate and the pixel width it declares. */
const SRCSET_CANDIDATE = /^(\S+)\s+(\d+)w$/;

class InstagramEmbedFetcher implements PostFetcher {
	readonly platform = 'instagram' as const;
	readonly providerName = 'Instagram embed';

	/**
	 * The endpoint needs no credentials, so the only precondition is the Rust
	 * side that issues the request.
	 */
	isConfigured(): boolean {
		return isTauri();
	}

	async fetch(reference: PostReference): Promise<FetchedPost> {
		const html = await invoke<string>('instagram_fetch_embed', {
			shortcode: reference.platformPostId
		});

		const embed = new DOMParser().parseFromString(html, 'text/html');
		const root = embed.querySelector('.Embed');

		// A deleted, private or disabled-account post answers 200 with a broken
		// media notice in place of the post. Only the notice's own line is read:
		// the block around it repeats the wordmark twice and ends in a link.
		if (!root) {
			throw new PostUnavailableError(
				text(embed.querySelector('.EmbedBrokenMedia .ebmMessage')) ||
					'Instagram did not return this post. It may be deleted, private, or from a disabled account.'
			);
		}

		const handle = readHandle(root) ?? reference.authorHandle;

		return {
			platform: 'instagram',
			platformPostId: reference.platformPostId,
			permalink: canonicalUrl(root.getAttribute('data-permalink')) ?? reference.permalink,

			// The embed prints the username where every other network prints a
			// display name, and carries the display name nowhere.
			authorName: handle ?? 'Unknown author',
			authorHandle: handle,
			authorProfileUrl:
				canonicalUrl(root.querySelector('a.Username')?.getAttribute('href')) ??
				(handle ? `https://www.instagram.com/${handle}/` : null),
			// Served at 100px square and signed at that size: a request for a
			// larger variant is rejected, so this is the whole of what is offered.
			authorAvatarUrl: root.querySelector('.Avatar img')?.getAttribute('src') ?? null,
			authorVerified: false,

			body: readBody(root),
			language: null,
			postedAt: null,

			likeCount: readLikeCount(root),
			repostCount: null,
			replyCount: null,

			media: readMedia(root),
			// The document itself is a quarter of a megabyte of page furniture and
			// is not worth a column; what the embed actually asserted about the
			// post is.
			raw: {
				mediaId: root.getAttribute('data-media-id'),
				mediaType: root.getAttribute('data-media-type'),
				ownerId: root.getAttribute('data-owner-id'),
				permalink: root.getAttribute('data-permalink')
			}
		};
	}
}

/** Text of an element, whitespace collapsed, or the empty string when absent. */
function text(element: Element | null | undefined): string {
	return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Drops the query and fragment an embed link carries for its own analytics. */
function canonicalUrl(href: string | null | undefined): string | null {
	if (!href) return null;
	try {
		const url = new URL(href);
		return `${url.origin}${url.pathname}`;
	} catch {
		return null;
	}
}

/**
 * Reads the author's handle.
 *
 * The header prints it, and the avatar's alternative text repeats it; the second
 * is consulted because the first is the element most likely to be restyled.
 */
function readHandle(root: Element): string | null {
	return (
		text(root.querySelector('.UsernameText')) ||
		root.querySelector('.Avatar img')?.getAttribute('alt')?.trim() ||
		null
	);
}

/**
 * Assembles the caption.
 *
 * The block opens with a link to the author, which is chrome rather than text
 * and is dropped. Line breaks are markup here, so they are read back out of it,
 * and the runs of empty lines Instagram uses for spacing are closed up to one.
 */
function readBody(root: Element): string {
	const caption = root.querySelector('.Caption');
	if (!caption) return '';

	const lines: string[] = [];
	for (const node of caption.childNodes) {
		if (node.nodeName === 'BR') {
			lines.push('\n');
			continue;
		}
		if (node instanceof Element && node.classList.contains('CaptionUsername')) continue;
		lines.push(node.textContent ?? '');
	}

	return lines
		.join('')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Reads the like count out of the line that renders it.
 *
 * The figure exists only as text. An account that hides its like count renders
 * no line at all, and a figure in some other shape than the English grouping the
 * request asks for is reported as unknown rather than guessed at.
 */
function readLikeCount(root: Element): number | null {
	const rendered = LIKE_COUNT.exec(text(root.querySelector('.SocialProof')));
	return rendered ? Number(rendered[1].replaceAll(',', '')) : null;
}

/**
 * Maps the rendered image onto the ingestion pipeline's own shape.
 *
 * Every asset the embed offers is an image: a photograph for a photo post, the
 * cover frame for a video, the first item for a carousel. See the note on the
 * class.
 */
function readMedia(root: Element): FetchedMedia[] {
	const description =
		root.getAttribute('data-media-type') === SIDECAR_MEDIA_TYPE
			? 'First image of a carousel'
			: null;
	const ratio = ASPECT_RATIO.exec(root.querySelector('.Content')?.getAttribute('style') ?? '');
	const assets: FetchedMedia[] = [];

	for (const image of root.querySelectorAll('img.EmbeddedMediaImage')) {
		const largest = largestCandidate(image);
		if (!largest) continue;

		assets.push({
			kind: 'image',
			sourceUrl: largest.url,
			description,
			width: largest.width,
			// The frame's aspect ratio is the only height the document states, so
			// the height is read off it rather than reported as unknown.
			height: ratio && largest.width ? Math.round((largest.width * Number(ratio[1])) / 100) : null,
			durationMs: null
		});
	}

	return assets;
}

/**
 * Picks the widest variant the image offers.
 *
 * `srcset` is not ordered, so the candidates are compared rather than taken in
 * turn; an image published without one falls back to its `src`, whose width the
 * document then does not state.
 */
function largestCandidate(image: Element): { url: string; width: number | null } | null {
	let best: { url: string; width: number } | null = null;

	for (const candidate of image.getAttribute('srcset')?.split(',') ?? []) {
		const parsed = SRCSET_CANDIDATE.exec(candidate.trim());
		if (!parsed) continue;
		const width = Number(parsed[2]);
		if (!best || width > best.width) best = { url: parsed[1], width };
	}

	if (best) return best;

	const src = image.getAttribute('src');
	return src ? { url: src, width: null } : null;
}

export const instagramEmbedFetcher = new InstagramEmbedFetcher();
