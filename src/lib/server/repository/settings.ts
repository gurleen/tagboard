import { eq } from 'drizzle-orm';
import { database } from '$lib/server/database';
import { setting } from '$lib/database/schema';

/**
 * The secret every output URL carries.
 *
 * An OBS browser source cannot sign in, so the output pages sit outside
 * Cloudflare Access and are guarded by this key instead. Regenerating it revokes
 * every output URL copied before.
 */
const OUTPUT_KEY_SETTING = 'output_key';

/**
 * The secret the public submission URL carries.
 *
 * Kept apart from the output key: the submission URL is printed on the wall as
 * a QR code for anyone in the room to scan, so it must not also grant the
 * ability to watch, or report airings for, an output.
 */
const SUBMISSION_KEY_SETTING = 'submission_key';

/** Whether the public submission page accepts photos. Open unless the operator closes it. */
const SUBMISSIONS_OPEN_SETTING = 'submissions_open';

/** Random bytes in a generated key: 192 bits, rendered as 32 URL-safe characters. */
const KEY_BYTE_LENGTH = 24;

/** The current output key, generated on first use. */
export function outputKey(): Promise<string> {
	return ensureKey(OUTPUT_KEY_SETTING);
}

/** Replaces the output key, revoking every output URL issued under the old one. */
export function regenerateOutputKey(): Promise<string> {
	return replaceKey(OUTPUT_KEY_SETTING);
}

/** Whether `candidate` is the current output key, compared in constant time. */
export function isOutputKey(candidate: string | null): Promise<boolean> {
	return matchesKey(OUTPUT_KEY_SETTING, candidate);
}

/** The current submission key, generated on first use. */
export function submissionKey(): Promise<string> {
	return ensureKey(SUBMISSION_KEY_SETTING);
}

/** Replaces the submission key, so every QR code and link shown before stops working. */
export function regenerateSubmissionKey(): Promise<string> {
	return replaceKey(SUBMISSION_KEY_SETTING);
}

/** Whether `candidate` is the current submission key, compared in constant time. */
export function isSubmissionKey(candidate: string | null): Promise<boolean> {
	return matchesKey(SUBMISSION_KEY_SETTING, candidate);
}

/** Whether the public submission page is accepting photos. */
export async function submissionsOpen(): Promise<boolean> {
	return (await readSetting(SUBMISSIONS_OPEN_SETTING)) !== false;
}

/** Opens or closes the public submission page. */
export async function setSubmissionsOpen(open: boolean): Promise<void> {
	await writeSetting(SUBMISSIONS_OPEN_SETTING, open);
}

async function ensureKey(name: string): Promise<string> {
	const stored = await readKey(name);
	if (stored) return stored;

	// Two first requests can race here; the loser's insert is ignored and both
	// read back the winner's key.
	await database()
		.insert(setting)
		.values({ key: name, value: generateKey() })
		.onConflictDoNothing();
	return (await readKey(name))!;
}

async function replaceKey(name: string): Promise<string> {
	const key = generateKey();
	await writeSetting(name, key);
	return key;
}

async function matchesKey(name: string, candidate: string | null): Promise<boolean> {
	if (!candidate) return false;
	const stored = await readKey(name);
	if (!stored || stored.length !== candidate.length) return false;

	let difference = 0;
	for (let index = 0; index < stored.length; index += 1) {
		difference |= stored.charCodeAt(index) ^ candidate.charCodeAt(index);
	}
	return difference === 0;
}

async function readKey(name: string): Promise<string | null> {
	const value = await readSetting(name);
	return typeof value === 'string' ? value : null;
}

async function readSetting(name: string): Promise<unknown> {
	const [row] = await database()
		.select({ value: setting.value })
		.from(setting)
		.where(eq(setting.key, name))
		.limit(1);
	return row?.value;
}

async function writeSetting(name: string, value: unknown): Promise<void> {
	await database()
		.insert(setting)
		.values({ key: name, value })
		.onConflictDoUpdate({ target: setting.key, set: { value } });
}

function generateKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTE_LENGTH));
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_');
}
