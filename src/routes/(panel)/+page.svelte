<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Text } from '$lib/components/ui/text/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { NonIdealState } from '$lib/components/ui/non-ideal-state/index.js';
	import AddPostDialog from '$lib/components/add-post-dialog.svelte';
	import PostCard from '$lib/components/post-card.svelte';
	import { queue } from '$lib/state/queue.svelte.js';
	import { describeError } from '$lib/utils';
	import type { PostRecord } from '$lib/database/records';
	import {
		cacheMediaForPost,
		listPosts,
		retryResolution,
		setReviewState,
		setReviewStateForAll,
		setStarred
	} from '$lib/remote/posts.remote';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import StarIcon from '@lucide/svelte/icons/star';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import InboxIcon from '@lucide/svelte/icons/inbox';

	let records = $state<PostRecord[]>([]);
	let loading = $state(true);
	let dialogOpen = $state(false);

	async function refresh() {
		loading = true;
		try {
			records = await listPosts({ reviewState: 'pending' });
			await queue.refresh();
		} catch (error) {
			toast.error(describeError(error));
		} finally {
			loading = false;
		}
	}

	onMount(refresh);

	/** Runs a change, reports a failure to the operator, and reloads the queue either way. */
	async function change(action: () => Promise<unknown>, success?: () => void) {
		try {
			await action();
			success?.();
		} catch (error) {
			toast.error(describeError(error));
		}
		await refresh();
	}

	function approve(record: PostRecord) {
		return change(
			() => setReviewState({ postId: record.id, reviewState: 'approved' }),
			() => toast.success('Approved.')
		);
	}

	function reject(record: PostRecord) {
		return change(
			() => setReviewState({ postId: record.id, reviewState: 'rejected' }),
			() => toast.info('Rejected.')
		);
	}

	function approveAll() {
		const postIds = records.map((record) => record.id);
		return change(
			() => setReviewStateForAll({ postIds, reviewState: 'approved' }),
			() => toast.success(`Approved ${postIds.length} posts.`)
		);
	}

	function toggleStar(record: PostRecord) {
		return change(() => setStarred({ postId: record.id, starred: !record.starred }));
	}

	function retry(record: PostRecord) {
		return change(async () => {
			await retryResolution(record.id);
			await cacheMediaForPost(record.id);
		});
	}
</script>

<div class="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<Text class="text-xl font-semibold sm:text-2xl">Review queue</Text>
			<Text class="text-sm text-muted-foreground">
				Approve a post to make it eligible for a board. Rejecting keeps the record so the same link
				is not reviewed twice.
			</Text>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			{#if queue.cachingCount > 0}
				<Badge variant="secondary">
					<Spinner size="sm" />
					Caching {queue.cachingCount}
				</Badge>
			{/if}
			<Button variant="secondary" onclick={approveAll} disabled={records.length === 0}>
				Approve all
			</Button>
			<Button onclick={() => (dialogOpen = true)}>
				<PlusIcon />
				Add post
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="flex justify-center p-12"><Spinner /></div>
	{:else if records.length === 0}
		<NonIdealState
			icon={InboxIcon}
			title="The queue is empty"
			description="Paste an X or Instagram link, or compose a post by hand, to put something in front of the operator."
		>
			{#snippet action()}
				<Button onclick={() => (dialogOpen = true)}>
					<PlusIcon />
					Add post
				</Button>
			{/snippet}
		</NonIdealState>
	{:else}
		<div class="space-y-3">
			{#each records as record (record.id)}
				<PostCard {record}>
					{#snippet actions(item)}
						<Button variant="success" size="sm" onclick={() => approve(item)}>
							<CheckIcon />
							Approve
						</Button>
						<Button variant="destructive" size="sm" onclick={() => reject(item)}>
							<XIcon />
							Reject
						</Button>
						<Button variant="ghost" size="sm" onclick={() => toggleStar(item)}>
							<StarIcon />
							{item.starred ? 'Unstar' : 'Star'}
						</Button>
						{#if item.resolutionState === 'failed'}
							<Button variant="ghost" size="sm" onclick={() => retry(item)}>
								<RefreshCwIcon />
								Retry
							</Button>
						{/if}
					{/snippet}
				</PostCard>
			{/each}
		</div>
	{/if}
</div>

<AddPostDialog bind:open={dialogOpen} onadded={refresh} />
