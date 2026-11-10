import * as v from 'valibot';
import { command } from '$app/server';
import { describeProviders as describeRegisteredProviders } from '$lib/server/ingestion/fetcher';
import * as posts from '$lib/server/repository/posts';
import * as settings from '$lib/server/repository/settings';

/**
 * The control panel's access to application settings, retrieval providers and
 * media storage. See the note in `posts.remote.ts`.
 */

export type { ProviderDescription } from '$lib/server/ingestion/fetcher';

export const describeProviders = command(() => describeRegisteredProviders());

export const storedByteLength = command(() => posts.storedByteLength());

export const outputKey = command(() => settings.outputKey());

export const regenerateOutputKey = command(() => settings.regenerateOutputKey());

export const submissionKey = command(() => settings.submissionKey());

export const regenerateSubmissionKey = command(() => settings.regenerateSubmissionKey());

export const submissionsOpen = command(() => settings.submissionsOpen());

export const setSubmissionsOpen = command(v.boolean(), (open) => settings.setSubmissionsOpen(open));
