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

/** Random bytes in a generated key: 192 bits, rendered as 32 URL-safe characters. */
const OUTPUT_KEY_BYTE_LENGTH = 24;

/** The current output key, generated on first use. */
export async function outputKey(): Promise<string> {
	const stored = await readOutputKey();
	if (stored) return stored;

	// Two first requests can race here; the loser's insert is ignored and both
	// read back the winner's key.
	await database()
		.insert(setting)
		.values({ key: OUTPUT_KEY_SETTING, value: generateOutputKey() })
		.onConflictDoNothing();
	return (await readOutputKey())!;
}

/** Replaces the output key, revoking every output URL issued under the old one. */
export async function regenerateOutputKey(): Promise<string> {
	const key = generateOutputKey();
	await database()
		.insert(setting)
		.values({ key: OUTPUT_KEY_SETTING, value: key })
		.onConflictDoUpdate({ target: setting.key, set: { value: key } });
	return key;
}

/** Whether `candidate` is the current output key, compared in constant time. */
export async function isOutputKey(candidate: string | null): Promise<boolean> {
	if (!candidate) return false;
	const stored = await readOutputKey();
	if (!stored || stored.length !== candidate.length) return false;

	let difference = 0;
	for (let index = 0; index < stored.length; index += 1) {
		difference |= stored.charCodeAt(index) ^ candidate.charCodeAt(index);
	}
	return difference === 0;
}

async function readOutputKey(): Promise<string | null> {
	const [row] = await database()
		.select({ value: setting.value })
		.from(setting)
		.where(eq(setting.key, OUTPUT_KEY_SETTING))
		.limit(1);
	return typeof row?.value === 'string' ? row.value : null;
}

function generateOutputKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(OUTPUT_KEY_BYTE_LENGTH));
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_');
}
