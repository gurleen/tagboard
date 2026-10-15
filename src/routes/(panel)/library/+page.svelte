<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Text } from '$lib/components/ui/text/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { NonIdealState } from '$lib/components/ui/non-ideal-state/index.js';
	import PostCard from '$lib/components/post-card.svelte';
	import AddPostDialog from '$lib/components/add-post-dialog.svelte';
	import { queue } from '$lib/state/queue.svelte.js';
	import {
		PLATFORMS,
		REVIEW_STATES,
		type Board,
		type Platform,
		type ReviewState
	} from '$lib/database/schema';
	import type { PostRecord } from '$lib/database/records';
	import { describeError } from '$lib/utils';
	import {
		cacheMediaForPost,
		deletePost,
		listPosts,
		setReviewState,
		setStarred
	} from '$lib/remote/posts.remote';
	import { addPostsToBoard, listBoards } from '$lib/remote/boards.remote';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import StarIcon from '@lucide/svelte/icons/star';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	const ANY = 'any';

	let records = $state<PostRecord[]>([]);
	let boards = $state<Board[]>([]);
	let loading = $state(true);
	let dialogOpen = $state(false);

	let search = $state('');
	let reviewFilter = $state<ReviewState | typeof ANY>('approved');
	let platformFilter = $state<Platform | typeof ANY>(ANY);
	/** Board the "Add to board" action targets; empty until boards exist. */
	let targetBoardId = $state('');

	async function refresh() {
		loading = true;
		try {
			records = await listPosts({
				reviewState: reviewFilter === ANY ? undefined : reviewFilter,
				platform: platformFilter === ANY ? undefined : platformFilter,
				search
			});
			boards = await listBoards();
			if (!targetBoardId && boards.length > 0) targetBoardId = boards[0].id;
			await queue.refresh();
		} catch (error) {
			toast.error(describeError(error));
		} finally {
			loading = false;
		}
	}

	onMount(refresh);

	/** Runs a change, reports a failure to the operator, and reloads the library either way. */
	async function change(action: () => Promise<unknown>) {
		try {
			await action();
		} catch (error) {
			toast.error(describeError(error));
		}
		await refresh();
	}

	async function addToBoard(record: PostRecord) {
		if (!targetBoardId) {
			toast.error('Create a board first.');
			return;
		}
		try {
			const added = await addPostsToBoard({ boardId: targetBoardId, postIds: [record.id] });
			if (added === 0) toast.info('That post is already on the board.');
			else toast.success('Added to board.');
		} catch (error) {
			toast.error(describeError(error));
		}
	}

	function remove(record: PostRecord) {
		return change(async () => {
			await deletePost(record.id);
			toast.info('Post deleted along with its cached media.');
		});
	}

	const targetBoardName = $derived(
		boards.find((item) => item.id === targetBoardId)?.name ?? 'No boards yet'
	);
</script>

<div class="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<Text class="text-xl font-semibold sm:text-2xl">Library</Text>
			<Text class="text-sm text-muted-foreground">
				Every post the panel has seen, whatever its verdict.
			</Text>
		</div>
		<Button onclick={() => (dialogOpen = true)}>
			<PlusIcon />
			Add post
		</Button>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<Input
			class="w-64"
			placeholder="Search text, author or handle"
			bind:value={search}
			onkeydown={(event: KeyboardEvent) => event.key === 'Enter' && refresh()}
		/>

		<Select.Root type="single" bind:value={reviewFilter} onValueChange={refresh}>
			<Select.Trigger class="w-40"
				>{reviewFilter === ANY ? 'Any state' : reviewFilter}</Select.Trigger
			>
			<Select.Content>
				<Select.Item value={ANY}>Any state</Select.Item>
				{#each REVIEW_STATES as state (state)}
					<Select.Item value={state}>{state}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Select.Root type="single" bind:value={platformFilter} onValueChange={refresh}>
			<Select.Trigger class="w-40">
				{platformFilter === ANY ? 'Any platform' : platformFilter}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value={ANY}>Any platform</Select.Item>
				{#each PLATFORMS as platform (platform)}
					<Select.Item value={platform}>{platform}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Button variant="secondary" onclick={refresh}>
			<RefreshCwIcon />
			Apply
		</Button>

		{#if boards.length > 0}
			<div class="ml-auto flex items-center gap-2">
				<span class="text-xs text-muted-foreground">Add to</span>
				<Select.Root type="single" bind:value={targetBoardId}>
					<Select.Trigger class="w-48">{targetBoardName}</Select.Trigger>
					<Select.Content>
						{#each boards as item (item.id)}
							<Select.Item value={item.id}>{item.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		{/if}
	</div>

	{#if loading}
		<div class="flex justify-center p-12"><Spinner /></div>
	{:else if records.length === 0}
		<NonIdealState
			icon={LibraryIcon}
			title="Nothing matches"
			description="Widen the filters, or add a post from a link or by hand."
		/>
	{:else}
		<div class="space-y-3">
			{#each records as record (record.id)}
				<PostCard {record}>
					{#snippet actions(item)}
						{#if item.reviewState === 'approved'}
							<Button variant="secondary" size="sm" onclick={() => addToBoard(item)}>
								<LayoutGridIcon />
								Add to board
							</Button>
						{:else}
							<Button
								variant="success"
								size="sm"
								onclick={() =>
									change(() => setReviewState({ postId: item.id, reviewState: 'approved' }))}
							>
								Approve
							</Button>
						{/if}

						{#if item.reviewState !== 'pending'}
							<Button
								variant="ghost"
								size="sm"
								onclick={() =>
									change(() => setReviewState({ postId: item.id, reviewState: 'pending' }))}
							>
								<RotateCcwIcon />
								Back to queue
							</Button>
						{/if}

						<Button
							variant="ghost"
							size="sm"
							onclick={() => change(() => setStarred({ postId: item.id, starred: !item.starred }))}
						>
							<StarIcon />
							{item.starred ? 'Unstar' : 'Star'}
						</Button>

						<Button
							variant="ghost"
							size="sm"
							onclick={() => change(() => cacheMediaForPost(item.id))}
						>
							<RefreshCwIcon />
							Re-cache media
						</Button>

						<Button variant="destructive" size="sm" class="ml-auto" onclick={() => remove(item)}>
							<Trash2Icon />
							Delete
						</Button>
					{/snippet}
				</PostCard>
			{/each}
		</div>
	{/if}
</div>

<AddPostDialog bind:open={dialogOpen} onadded={refresh} />
