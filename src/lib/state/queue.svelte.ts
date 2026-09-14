import { isTauri } from '@tauri-apps/api/core';
import type { ReviewState } from '$lib/database/schema';
import { countByReviewState, pendingMediaCount } from '$lib/repository/posts';

/**
 * Review counts shared by the sidebar badge and the queue page.
 *
 * Held in one place so that approving a post updates the badge without the two
 * views having to know about each other. Every mutation path calls
 * {@link QueueCounts.refresh} once it has finished writing.
 */
class QueueCounts {
	counts = $state<Record<ReviewState, number>>({
		pending: 0,
		approved: 0,
		rejected: 0,
		archived: 0
	});

	/** Assets still downloading, shown as a caching indicator. */
	cachingCount = $state(0);

	get pendingCount(): number {
		return this.counts.pending;
	}

	get approvedCount(): number {
		return this.counts.approved;
	}

	/** Re-reads the counts. Outside the Tauri runtime there is no database to read. */
	async refresh(): Promise<void> {
		if (!isTauri()) return;
		this.counts = await countByReviewState();
		this.cachingCount = await pendingMediaCount();
	}
}

export const queue = new QueueCounts();
