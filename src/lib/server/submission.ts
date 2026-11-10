import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	ACCEPTED_IMAGE_CONTENT_TYPES,
	MAXIMUM_AUTHOR_NAME_LENGTH,
	MAXIMUM_CAPTION_LENGTH,
	MAXIMUM_IMAGE_BYTE_LENGTH
} from '$lib/submission/endpoints';
import type { SubmittedPostInput } from '$lib/server/repository/posts';
import { isSubmissionKey, submissionsOpen } from '$lib/server/repository/settings';

/**
 * Shared by the endpoints under `/submit`, which are reached by anyone who scans
 * the QR code on the wall and so are guarded by the submission key rather than
 * by Cloudflare Access.
 */

/** Credited when the sender leaves their name blank. */
const ANONYMOUS_AUTHOR_NAME = 'Guest';

const submissionFields = v.object({
	authorName: v.pipe(v.string(), v.trim(), v.maxLength(MAXIMUM_AUTHOR_NAME_LENGTH)),
	caption: v.pipe(v.string(), v.trim(), v.maxLength(MAXIMUM_CAPTION_LENGTH))
});

/** Refuses the request unless it carries the current submission key. */
export async function authorizeSubmission(url: URL): Promise<void> {
	if (!(await isSubmissionKey(url.searchParams.get('key')))) {
		error(403, 'This link is no longer valid. Scan the code on the screen again.');
	}
}

/** Refuses the request while the operator has closed submissions. */
export async function requireSubmissionsOpen(): Promise<void> {
	if (!(await submissionsOpen())) {
		error(409, 'Photos are not being accepted right now.');
	}
}

/**
 * Reads and validates a submission form.
 *
 * The image's format is decided from its leading bytes, not from the name or
 * type the browser reported, because `/media` serves it back under the type
 * recorded here.
 */
export async function readSubmission(request: Request): Promise<SubmittedPostInput> {
	const declaredLength = Number(request.headers.get('content-length') ?? 0);
	// The form carries two short fields alongside the image.
	if (declaredLength > MAXIMUM_IMAGE_BYTE_LENGTH + 64 * 1024) error(413, tooLargeMessage());

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'The submission could not be read.');
	}

	const fields = v.safeParse(submissionFields, {
		authorName: form.get('authorName') ?? '',
		caption: form.get('caption') ?? ''
	});
	if (!fields.success) {
		error(
			400,
			`Keep your name under ${MAXIMUM_AUTHOR_NAME_LENGTH} characters and your caption under ${MAXIMUM_CAPTION_LENGTH}.`
		);
	}

	const image = form.get('image');
	if (!(image instanceof Blob) || image.size === 0) error(400, 'Choose a photo to send.');
	if (image.size > MAXIMUM_IMAGE_BYTE_LENGTH) error(413, tooLargeMessage());

	const bytes = new Uint8Array(await image.arrayBuffer());
	const contentType = identifyImage(bytes);
	if (!contentType) error(415, 'Send a JPEG, PNG, GIF or WebP photo.');

	return {
		authorName: fields.output.authorName || ANONYMOUS_AUTHOR_NAME,
		caption: fields.output.caption,
		image: { bytes, contentType }
	};
}

function tooLargeMessage(): string {
	return `That photo is larger than ${MAXIMUM_IMAGE_BYTE_LENGTH / (1024 * 1024)} MB.`;
}

type AcceptedImageContentType = (typeof ACCEPTED_IMAGE_CONTENT_TYPES)[number];

/** The accepted format whose signature the bytes begin with, if any. */
function identifyImage(bytes: Uint8Array): AcceptedImageContentType | null {
	const startsWith = (signature: number[], offset = 0) =>
		signature.every((byte, index) => bytes[offset + index] === byte);
	const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0));

	if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (startsWith(ascii('GIF87a')) || startsWith(ascii('GIF89a'))) return 'image/gif';
	if (startsWith(ascii('RIFF')) && startsWith(ascii('WEBP'), 8)) return 'image/webp';
	return null;
}
