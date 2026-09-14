import type { Platform } from '$lib/database/schema';

/**
 * Failures every provider can raise, kept apart from the fetcher contract
 * itself.
 *
 * `fetcher.ts` both declares the contract and holds the registry of
 * implementations, so a provider that imported an error class from it would
 * close a cycle: the registry would be asked for its members while it was still
 * being evaluated. Errors are values rather than types and cannot be erased, so
 * they live here, where both sides can reach them.
 */

export class FetcherNotConfiguredError extends Error {
	constructor(
		readonly platform: Platform,
		readonly providerName: string
	) {
		super(
			`The ${providerName} provider is not available, so ${platform} posts cannot be retrieved automatically. Add the post by hand, or check the provider list in Settings.`
		);
		this.name = 'FetcherNotConfiguredError';
	}
}

export class FetcherUnavailableError extends Error {
	constructor(readonly platform: Platform) {
		super(`No fetcher is registered for the ${platform} platform.`);
		this.name = 'FetcherUnavailableError';
	}
}

/**
 * Raised when a provider answers but the post is not readable — deleted,
 * private, or from an account the platform has withdrawn.
 *
 * Both providers report this the same way: a successful response whose body
 * stands in for the post rather than describing it. The row is left in `failed`
 * so the operator can retry it.
 */
export class PostUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PostUnavailableError';
	}
}
