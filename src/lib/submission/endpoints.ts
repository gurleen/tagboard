/**
 * Bindings to the public submission endpoints under `/submit`, and the URL the
 * output encodes in its QR code.
 *
 * Every request carries the submission key; see
 * `$lib/server/repository/settings`. The limits here are enforced again on the
 * server, which trusts nothing the page sends.
 */

/** Longest caption a submission may carry. */
export const MAXIMUM_CAPTION_LENGTH = 280;

/** Longest name a sender may be credited under. */
export const MAXIMUM_AUTHOR_NAME_LENGTH = 60;

/** Largest photo the server accepts, after the page has scaled it down. */
export const MAXIMUM_IMAGE_BYTE_LENGTH = 15 * 1024 * 1024;

/** Image formats the server accepts, identified by their leading bytes rather than their name. */
export const ACCEPTED_IMAGE_CONTENT_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp'
] as const;

/** Whether the submission page can be used. */
export type SubmissionStatus =
	| { status: 'open' }
	/** The operator has stopped taking photos for now. */
	| { status: 'closed' }
	/** The key was refused — regenerated since the code was shown, most likely. */
	| { status: 'refused' }
	| { status: 'unavailable' };

/** What sending a submission came to. */
export type SubmissionOutcome = { status: 'accepted' } | { status: 'rejected'; message: string };

/** The URL the output's QR code points at. */
export function submissionUrl(origin: string, key: string): string {
	return `${origin}/submit?key=${encodeURIComponent(key)}`;
}

/** Asks whether the submission page is accepting photos. */
export async function readSubmissionStatus(key: string): Promise<SubmissionStatus> {
	let response: Response;
	try {
		response = await fetch(`/submit/status?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
	} catch {
		return { status: 'unavailable' };
	}

	if (response.status === 403) return { status: 'refused' };
	if (!response.ok) return { status: 'unavailable' };
	const { open } = (await response.json()) as { open: boolean };
	return { status: open ? 'open' : 'closed' };
}

/** Sends a photo and caption into the review queue. */
export async function sendSubmission(
	key: string,
	submission: { authorName: string; caption: string; image: Blob }
): Promise<SubmissionOutcome> {
	const form = new FormData();
	form.set('authorName', submission.authorName);
	form.set('caption', submission.caption);
	form.set('image', submission.image);

	let response: Response;
	try {
		response = await fetch(`/submit/upload?key=${encodeURIComponent(key)}`, {
			method: 'POST',
			body: form
		});
	} catch {
		return { status: 'rejected', message: 'The photo could not be sent. Check your connection.' };
	}

	if (response.ok) return { status: 'accepted' };
	const message = await response
		.json()
		.then((body: { message?: string }) => body.message)
		.catch(() => undefined);
	return { status: 'rejected', message: message ?? 'The photo could not be sent.' };
}

/** Longest edge, in pixels, the page scales a photo down to before sending it. */
const PREPARED_IMAGE_EDGE_LENGTH = 2048;

/**
 * Re-encodes a photo as a JPEG no larger than {@link PREPARED_IMAGE_EDGE_LENGTH}
 * on its longest edge.
 *
 * A phone photo arrives at several megabytes, often as HEIC, which only Safari
 * can draw; re-encoding makes it small and displayable everywhere, and drops
 * its metadata — the location it was taken at included — on the way. A GIF is
 * sent as it is, so it keeps its animation, and so is anything the browser
 * cannot decode: the server makes the final decision.
 */
export async function prepareImage(file: File): Promise<Blob> {
	if (file.type === 'image/gif') return file;

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		return file;
	}

	const scale = Math.min(1, PREPARED_IMAGE_EDGE_LENGTH / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();

	const encoded = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/jpeg', 0.86)
	);
	return encoded ?? file;
}
